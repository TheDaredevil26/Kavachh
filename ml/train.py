"""
Model training pipeline for Kavach Fraud Detection.
Trains an XGBoost classifier on tabular fraud and telemetry features.
Saves model and scaler artifacts to data/models/.
"""

import os
import joblib
import pandas as pd
from sklearn.metrics import classification_report, f1_score, precision_score, recall_score, roc_auc_score
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler
from xgboost import XGBClassifier

from features import FEATURES


def train(data_path: str = None, models_dir: str = None):
    base_dir = os.path.dirname(os.path.abspath(__file__))
    if data_path is None:
        data_path = os.path.join(base_dir, 'data', 'training_data.csv')
    if models_dir is None:
        models_dir = os.path.join(base_dir, 'data', 'models')

    if not os.path.exists(data_path):
        raise FileNotFoundError(f"Training data not found at {data_path}. Run synthetic_data.py first.")

    print(f"Loading training data from: {data_path}")
    df = pd.read_csv(data_path)
    X = df[FEATURES]
    y = df['label']

    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=42, stratify=y
    )

    scaler = StandardScaler()
    X_train_s = scaler.fit_transform(X_train)
    X_test_s = scaler.transform(X_test)

    # Calculate class weighting for imbalance
    n_neg = (y_train == 0).sum()
    n_pos = (y_train == 1).sum()
    pos_weight = float(n_neg / max(1, n_pos))

    model = XGBClassifier(
        n_estimators=200,
        max_depth=5,
        learning_rate=0.1,
        scale_pos_weight=pos_weight,
        eval_metric='logloss',
        random_state=42,
    )

    model.fit(X_train_s, y_train, eval_set=[(X_test_s, y_test)], verbose=False)

    y_pred = model.predict(X_test_s)
    y_prob = model.predict_proba(X_test_s)[:, 1]

    precision = precision_score(y_test, y_pred, zero_division=0)
    recall = recall_score(y_test, y_pred, zero_division=0)
    f1 = f1_score(y_test, y_pred, zero_division=0)
    auc = roc_auc_score(y_test, y_prob)

    print("\n--- Model Evaluation Metrics ---")
    print(classification_report(y_test, y_pred))
    print(f"Precision: {precision:.4f}")
    print(f"Recall:    {recall:.4f}")
    print(f"F1 Score:  {f1:.4f}")
    print(f"ROC-AUC:   {auc:.4f}")
    print("--------------------------------\n")

    os.makedirs(models_dir, exist_ok=True)
    model_path = os.path.join(models_dir, 'fraud_detector_v1.pkl')
    scaler_path = os.path.join(models_dir, 'scaler_v1.pkl')

    joblib.dump(model, model_path)
    joblib.dump(scaler, scaler_path)

    # Also save standard unversioned aliases for backward/forward compatibility
    joblib.dump(model, os.path.join(models_dir, 'fraud_model.pkl'))
    joblib.dump(scaler, os.path.join(models_dir, 'scaler.pkl'))

    print(f"Model successfully saved to {model_path}")
    print(f"Scaler successfully saved to {scaler_path}")
    return model, scaler


if __name__ == '__main__':
    train()
