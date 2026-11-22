"""
Feature extraction and signal generation for Kavach ML / Fraud Detection Service.
Contract Version: 1.0
"""

from typing import Any, Dict, List, Union
import math

FEATURES: List[str] = [
    'gps_jitter_score',
    'velocity_plausible',
    'pre_trigger_active',
    'delivery_history_hours',
    'registration_age_days',
    'registration_ip_cluster',
    'zone_claim_rate',
    'burst_flag',
]


def _get_val(obj: Any, key: str, default: Any = None) -> Any:
    """Helper to safely retrieve a key/attribute from a dict or Pydantic model."""
    if isinstance(obj, dict):
        val = obj.get(key, default)
    else:
        val = getattr(obj, key, default)
    return default if val is None else val


def extract(req: Union[Dict[str, Any], Any]) -> List[float]:
    """
    Extracts the ordered feature vector corresponding to FEATURES.
    Accepts a dictionary or a Pydantic ClaimInferenceRequest instance.
    Returns a list of 8 floats.
    """
    # 1. gps_jitter_score
    jitter = _get_val(req, 'gps_jitter_score', None)
    if jitter is None:
        gps_history = _get_val(req, 'pre_trigger_gps_history', [])
        if gps_history and len(gps_history) >= 2:
            lats = [float(p['lat']) for p in gps_history if 'lat' in p]
            if len(lats) > 1:
                mean_lat = sum(lats) / len(lats)
                variance = sum((x - mean_lat) ** 2 for x in lats) / len(lats)
                jitter = math.sqrt(variance) * 111000.0  # approximate meters
            else:
                jitter = 0.85
        else:
            jitter = 0.85
    gps_jitter_score = float(jitter)

    # 2. velocity_plausible (1.0 = physically possible, 0.0 = impossible/spoofed)
    velocity = _get_val(req, 'velocity_plausible', None)
    if velocity is None:
        velocity = 1.0
    velocity_plausible = float(velocity)

    # 3. pre_trigger_active (1.0 = present before announcement, 0.0 = inactive)
    pre_active = _get_val(req, 'pre_trigger_active', None)
    if pre_active is None:
        qr = _get_val(req, 'qr_checkin_within_window', False)
        pre_active = 1.0 if qr else 1.0
    pre_trigger_active = float(pre_active)

    # 4. delivery_history_hours
    deliv_hours = _get_val(req, 'delivery_history_hours', None)
    if deliv_hours is None:
        deliv_hours = 2.5
    delivery_history_hours = float(deliv_hours)

    # 5. registration_age_days
    reg_age = _get_val(req, 'registration_age_days', None)
    if reg_age is None:
        reg_age = 60.0
    registration_age_days = float(reg_age)

    # 6. registration_ip_cluster
    ip_cluster = _get_val(req, 'registration_ip_cluster', None)
    if ip_cluster is None:
        ip_cluster = 1.0
    registration_ip_cluster = float(ip_cluster)

    # 7. zone_claim_rate
    rate = _get_val(req, 'zone_claim_rate', None)
    if rate is None:
        claim_count = _get_val(req, 'zone_claim_count', 0)
        total_workers = _get_val(req, 'zone_total_workers', 0)
        if total_workers and total_workers > 0:
            rate = claim_count / total_workers
        else:
            rate = 0.40
    zone_claim_rate = float(rate)

    # 8. burst_flag
    burst = _get_val(req, 'burst_flag', None)
    if burst is None:
        claims_3min = _get_val(req, 'zone_claims_last_3min', 0)
        burst = 1.0 if claims_3min > 50 else 0.0
    burst_flag = float(burst)

    return [
        gps_jitter_score,
        velocity_plausible,
        pre_trigger_active,
        delivery_history_hours,
        registration_age_days,
        registration_ip_cluster,
        zone_claim_rate,
        burst_flag,
    ]


def extract_signals(req: Union[Dict[str, Any], Any], vec: List[float]) -> List[Dict[str, Any]]:
    """
    Evaluates individual defensive fraud layers from the feature vector and request context.
    Returns a list of signal dicts:
    [
        {"type": str, "suspicious": bool, "score": float, "details": dict},
        ...
    ]
    Score is on 0..1 scale where 1.0 = genuine, 0.0 = fraudulent.
    """
    feat_map = dict(zip(FEATURES, vec))

    gps_jitter = feat_map['gps_jitter_score']
    vel_plausible = feat_map['velocity_plausible']
    pre_active = feat_map['pre_trigger_active']
    delivery_hours = feat_map['delivery_history_hours']
    reg_age = feat_map['registration_age_days']
    ip_cluster = feat_map['registration_ip_cluster']
    zone_rate = feat_map['zone_claim_rate']
    burst = feat_map['burst_flag']

    signals: List[Dict[str, Any]] = []

    # 1. LAYER A: GPS Physics
    # Perfect jitter (< 0.05m) indicates synthetic/mocked GPS; impossible velocity (< 1.0) indicates spoofing
    impossible_velocity = vel_plausible < 0.5
    too_perfect_jitter = gps_jitter < 0.05
    gps_suspicious = impossible_velocity or too_perfect_jitter
    if impossible_velocity:
        gps_score = 0.05
    elif too_perfect_jitter:
        gps_score = 0.20
    else:
        gps_score = 0.95

    signals.append({
        'type': 'gps_physics',
        'suspicious': gps_suspicious,
        'score': round(gps_score, 4),
        'details': {
            'gps_jitter_score': round(gps_jitter, 4),
            'velocity_plausible': vel_plausible >= 0.5,
            'too_perfect_jitter': too_perfect_jitter,
            'impossible_velocity': impossible_velocity,
        },
    })

    # 2. LAYER F: Temporal Decoupling / Pre-trigger activity
    # Absence before trigger announcement indicates retroactive claim attempt
    temporal_suspicious = pre_active < 0.5
    temporal_score = 0.10 if temporal_suspicious else 0.98

    signals.append({
        'type': 'temporal',
        'suspicious': temporal_suspicious,
        'score': round(temporal_score, 4),
        'details': {
            'pre_trigger_active': int(pre_active >= 0.5),
        },
    })

    # 3. LAYER E: Platform Delivery History
    # Dormant accounts (> 48h since last order) during disaster have high fraud propensity
    dormant = delivery_hours > 48.0
    if dormant:
        delivery_score = 0.10
    else:
        delivery_score = max(0.20, min(0.99, 1.0 - (delivery_hours / 48.0) * 0.5))

    signals.append({
        'type': 'platform_activity',
        'suspicious': dormant,
        'score': round(delivery_score, 4),
        'details': {
            'delivery_history_hours': round(delivery_hours, 2),
            'is_dormant': dormant,
        },
    })

    # 4. LAYER B: Network Graph Analysis
    # Coordinated farms share IPs (> 5 accounts) or create disposable accounts (< 3 days)
    high_ip_cluster = ip_cluster > 5.0
    new_account = reg_age < 3.0
    network_suspicious = high_ip_cluster or new_account
    if high_ip_cluster:
        network_score = 0.10
    elif new_account:
        network_score = 0.25
    else:
        network_score = 0.95

    signals.append({
        'type': 'network_graph',
        'suspicious': network_suspicious,
        'score': round(network_score, 4),
        'details': {
            'registration_ip_cluster': int(ip_cluster),
            'registration_age_days': round(reg_age, 1),
            'high_ip_cluster': high_ip_cluster,
            'new_account': new_account,
        },
    })

    # 5. LAYER D: Zone Claim Rate
    # Participation > 70% of zone workers indicates syndicated ring collusion
    high_claim_rate = zone_rate > 0.70
    rate_score = 0.15 if high_claim_rate else 0.95

    signals.append({
        'type': 'zone_claim_rate',
        'suspicious': high_claim_rate,
        'score': round(rate_score, 4),
        'details': {
            'zone_claim_rate': round(zone_rate, 4),
            'rate_anomaly': high_claim_rate,
        },
    })

    # 6. LAYER C: Claim Burst Detection
    # Bursts (> 50 claims in < 3 minutes) indicate synchronized script submission
    burst_detected = burst >= 0.5
    burst_score = 0.10 if burst_detected else 0.95

    signals.append({
        'type': 'burst',
        'suspicious': burst_detected,
        'score': round(burst_score, 4),
        'details': {
            'burst_flag': int(burst_detected),
        },
    })

    return signals
