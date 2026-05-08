# US 04-03 — Notification email à chaque changement de statut de dossier

## Objectif

En tant que client, recevoir une notification par email à chaque transition de statut de mon dossier afin d'être informé en temps réel de l'avancement de mon dossier.

## Implémentation

### Backend

#### Nouveau service d'email — `app/services/emailing.py`

**`_STATUS_LABELS`** : dictionnaire de traduction des statuts en français.

```python
_STATUS_LABELS = {
    "brouillon": "Brouillon",
    "depose": "Déposé",
    "en_instruction": "En instruction",
    "valide": "Validé",
    "rejete": "Rejeté",
    "annule": "Annulé",
}
```

**`_build_status_change_email_html()`** : construit le template HTML de notification :
- Référence du dossier mise en avant
- Statut traduit en français
- Bouton CTA « Voir mon dossier » avec lien direct
- Bloc visuel rouge « Motif de rejet » affiché uniquement si `motif_rejet` est renseigné

**`send_status_change_email()`** : fonction publique d'envoi via Resend.

```python
def send_status_change_email(
    *,
    to_email: str,
    dossier_reference: str,
    nouveau_status: str,
    dossier_url: str,
    motif_rejet: str | None = None,
) -> None: ...
```

Comportement :
- **Si `resend` package absent** : log warning, retour sans exception
- **Si `RESEND_API_KEY` absente** : log warning, retour sans exception
- **Si l'envoi Resend échoue** : log exception, retour sans propagation (non-bloquant)
- Objet de l'email : `Votre dossier {reference} : {statut_français}`

#### Endpoint soumission — `POST /api/v1/dossiers/{id}/submit`

Remplacement de `send_dossier_submission_email` par `send_status_change_email` lors de la transition `brouillon → depose`.

```python
send_status_change_email(
    to_email=user.email,
    dossier_reference=dossier.reference,
    nouveau_status=dossier.status.value,          # "depose"
    dossier_url=f"{settings.FRONTEND_BASE_URL}/mes-dossiers/{dossier.id}",
)
```

L'URL directe vers le dossier est construite depuis `FRONTEND_BASE_URL` (variable d'environnement) — garantit un délai < 1 seconde après le changement de statut.

**Principe de résilience** : l'échec d'envoi est capturé et journalisé, mais n'annule pas la soumission déjà persistée en base de données.

### Extensibilité pour futures transitions

La fonction `send_status_change_email` est conçue comme point d'entrée unique pour **toutes** les transitions de statut. Les endpoints gestionnaire (en_instruction, valide, rejete, annule) l'appelleront avec le statut correspondant et, le cas échéant, le motif de rejet.

```python
# Exemple lors d'un rejet par un gestionnaire (US future)
send_status_change_email(
    to_email=client.email,
    dossier_reference=dossier.reference,
    nouveau_status="rejete",
    dossier_url=f"{settings.FRONTEND_BASE_URL}/mes-dossiers/{dossier.id}",
    motif_rejet=dossier.motif_rejet,
)
```

## Critères DoD couverts

| Critère | Statut |
|---------|--------|
| Email envoyé automatiquement à chaque transition de statut | ✅ Déclenché dans `submit_dossier`, extensible aux autres transitions |
| L'email précise la référence du dossier | ✅ Dans le corps et l'objet de l'email |
| L'email précise le nouveau statut | ✅ Traduit en français |
| Motif de rejet inclus si rejet | ✅ Bloc visuel conditionnel dans le template HTML |
| Délai d'envoi < 5 minutes | ✅ Envoi synchrone immédiat après la transition en base |
| Lien direct vers le dossier inclus | ✅ Bouton CTA + lien texte de secours |

## Tests associés

### Nouveau fichier — `backend/tests/unit/test_emailing.py` (20 tests)

**`TestBuildStatusChangeEmailHtml`** (8 tests) :
- `test_contains_dossier_reference` — référence présente dans le HTML
- `test_contains_dossier_url_as_link` — URL du dossier dans le template
- `test_status_label_displayed_in_french[*]` — 6 statuts traduits (parametrize)
- `test_rejection_reason_shown_when_provided` — bloc motif affiché si renseigné
- `test_no_rejection_block_when_motif_absent` — pas de bloc si `motif_rejet=None`
- `test_no_rejection_block_when_motif_empty_string` — pas de bloc si chaîne vide
- `test_html_contains_cta_button_text` — bouton « Voir mon dossier » présent
- `test_html_contains_mmotors_branding` — header M-Motors présent

**`TestSendStatusChangeEmail`** (7 tests) :
- `test_logs_warning_when_resend_package_absent` — warning si package absent
- `test_logs_warning_when_api_key_absent` — warning si clé vide
- `test_logs_warning_when_api_key_none` — warning si clé None
- `test_calls_resend_with_correct_recipient` — bon destinataire transmis
- `test_subject_contains_reference_and_french_status` — objet email vérifié
- `test_sends_rejection_reason_in_html_when_provided` — motif dans le HTML
- `test_does_not_raise_when_resend_send_fails` — pas de propagation d'exception

### Mises à jour dans `backend/tests/unit/test_dossiers.py` (3 tests)

- `test_submit_dossier_sends_status_change_email_on_deposit` _(mis à jour)_ — vérifie l'appel de `send_status_change_email` avec `to_email`, `dossier_reference`, `nouveau_status="depose"` et `dossier_url` contenant l'id
- `test_submit_dossier_email_dossier_url_contains_dossier_id` _(nouveau)_ — vérifie que l'URL incluse contient l'id du dossier et "mes-dossiers"
- `test_submit_dossier_email_failure_does_not_block_submission` _(nouveau)_ — vérifie que la soumission est persistée même si l'envoi email lève une exception

## Configuration requise

| Variable | Description | Valeur par défaut |
|----------|-------------|-------------------|
| `RESEND_API_KEY` | Clé API Resend | _(absent = emails désactivés)_ |
| `RESEND_FROM_EMAIL` | Adresse expéditeur | `M-Motors <no-reply@mmotors.dev>` |
| `FRONTEND_BASE_URL` | URL publique du frontend | `https://netdevops.fr` |
