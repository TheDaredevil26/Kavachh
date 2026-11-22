"""
Synthetic data generator for Kavach ML / Fraud Detection training.
Generates 500 genuine + 100 fraud claims with realistic distribution and label noise.
"""

import os
import random
from typing import Dict, List
import numpy as np
import pandas as pd


def generate_genuine_claim() -> Dict[str, float]:
    """Generates a realistic genuine gig-worker claim."""
    return {
        'gps_jitter_score': round(float(np.clip(np.random.normal(0.8, 0.15), 0.1, 2.5)), 4),
        'velocity_plausible': 1.0,
        'pre_trigger_active': 1.0,
        'delivery_history_hours': round(float(np.random.uniform(0.2, 8.0)), 2),
        'registration_age_days': float(random.randint(30, 730)),
        'registration_ip_cluster': float(random.randint(1, 2)),
        'zone_claim_rate': round(float(np.random.uniform(0.20, 0.55)), 2),
        'burst_flag': 0.0,
        'label': 0,
    }


def generate_fraud_claim() -> Dict[str, float]:
    """Generates a fraudulent claim characteristic of syndicated fraud rings."""
    return {
        'gps_jitter_score': round(float(np.clip(np.random.normal(0.02, 0.01), 0.001, 0.049)), 4),
        'velocity_plausible': float(random.choice([0.0, 1.0])),
        'pre_trigger_active': 0.0,
        'delivery_history_hours': round(float(np.random.uniform(48.0, 240.0)), 2),
        'registration_age_days': float(random.randint(1, 5)),
        'registration_ip_cluster': float(random.randint(8, 50)),
        'zone_claim_rate': round(float(np.random.uniform(0.75, 0.99)), 2),
        'burst_flag': 1.0,
        'label': 1,
    }


def generate_dataset(
    n_genuine: int = 500,
    n_fraud: int = 100,
    noise_ratio: float = 0.05,
    random_seed: int = 42,
) -> pd.DataFrame:
    """
    Generates synthetic training dataset of genuine and fraud claims.
    Applies realistic label noise / hard cases to simulate real-world data.
    """
    np.random.seed(random_seed)
    random.seed(random_seed)

    genuine = [generate_genuine_claim() for _ in range(n_genuine)]
    fraud = [generate_fraud_claim() for _ in range(n_fraud)]

    # Hard cases / boundary cases
    # e.g., A genuine worker who recently joined or has slightly lower jitter
    for g in genuine[:15]:
        g['registration_age_days'] = float(random.randint(5, 20))
        g['delivery_history_hours'] = round(float(random.uniform(10.0, 30.0)), 2)

    # e.g., A fraudster who tries to add minor noise to jitter
    for f in fraud[:5]:
        f['gps_jitter_score'] = round(float(random.uniform(0.1, 0.3)), 4)
        f['velocity_plausible'] = 1.0

    df = pd.DataFrame(genuine + fraud)

    # Apply 5% label noise (flip labels to simulate reporting/human review errors)
    n_noisy = int(len(df) * noise_ratio)
    noisy_indices = np.random.choice(df.index, size=n_noisy, replace=False)
    df.loc[noisy_indices, 'label'] = 1 - df.loc[noisy_indices, 'label']

    # Shuffle dataset
    df = df.sample(frac=1.0, random_state=random_seed).reset_index(drop=True)
    return df


def main(output_file: str = None):
    if output_file is None:
        base_dir = os.path.dirname(os.path.abspath(__file__))
        output_file = os.path.join(base_dir, 'data', 'training_data.csv')

    os.makedirs(os.path.dirname(output_file), exist_ok=True)
    df = generate_dataset()
    df.to_csv(output_file, index=False)
    print(f"Generated {len(df)} samples ({df['label'].value_counts().to_dict()}) -> {output_file}")
    return output_file


if __name__ == '__main__':
    main()
