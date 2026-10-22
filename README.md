# COGITOBE

<https://cogitobe.vercel.app>

Une PWA volontairement absurde : on arrive, on accepte les notifications, et toutes les heures on reçoit une phrase au hasard, soit pour lâcher son écran (« Don't scroll. »), soit pour se motiver (« Crois en toi. »). Pas d'inscription, pas de compte, aucune donnée personnelle. Places limitées à 8 000 abonnés ; au-delà, la page affiche « Hey, trop tard… la file est pleine !! ».

## Structure

```
cogitobe/
├── public/
│   ├── index.html            page unique (noir, blanc, un bouton)
│   ├── sw.js                 service worker : affiche les notifications, cache minimal
│   ├── manifest.webmanifest  manifest PWA
│   └── icons/                icônes (192, 512, maskable, apple-touch, badge)
├── api/
│   ├── subscribe.js          GET : clé publique + état complet · POST : inscription (plafond 8000)
│   ├── send.js               envoie une phrase au hasard à tous (CRON_SECRET)
│   └── stats.js              nombre d'abonnés (STATS_SECRET)
├── lib/
│   ├── redis.js              client Upstash Redis, plafond, paliers
│   ├── alert.js              mail d'alerte via Resend
│   └── auth.js               vérification des secrets
├── messages.json             100 phrases (FR/EN, anti-écran/motivation)
└── vercel.json
```

Les abonnements sont stockés dans un hash Redis `dont-scroll:subs` : clé = empreinte SHA-256 de l'endpoint push, valeur = l'abonnement. Le set `dont-scroll:milestones` mémorise les paliers déjà signalés par mail. Rien d'autre n'est conservé.

L'inscription passe par un script Lua exécuté atomiquement par Redis : même avec des clics simultanés, le plafond ne peut pas être dépassé. Une personne déjà inscrite peut toujours resynchroniser son abonnement quand la file est pleine.

## Déploiement

### 1. Générer les clés VAPID

```bash
npm install
npx web-push generate-vapid-keys
```

Garde la **Public Key** et la **Private Key** affichées. Ne les régénère pas plus tard : changer de clés invalide tous les abonnements existants.

### 2. Créer la base Upstash Redis

Deux options :

- **Depuis Vercel** : projet > Storage (ou Marketplace) > Upstash Redis > crée la base et relie-la au projet. Les variables `KV_REST_API_URL` et `KV_REST_API_TOKEN` sont ajoutées automatiquement, le code les reconnaît.
- **Depuis upstash.com** : crée une base Redis, puis copie dans l'onglet REST API les valeurs `UPSTASH_REDIS_REST_URL` et `UPSTASH_REDIS_REST_TOKEN`.

### 3. Déployer sur Vercel

1. Pousse le dossier sur un dépôt GitHub.
2. Sur vercel.com : Add New > Project > importe le dépôt. Preset : **Other**, pas de commande de build.
3. Ajoute les variables d'environnement (Settings > Environment Variables) :

| Variable | Valeur |
|---|---|
| `VAPID_PUBLIC_KEY` | clé publique de l'étape 1 |
| `VAPID_PRIVATE_KEY` | clé privée de l'étape 1 |
| `VAPID_SUBJECT` | `https://cogitobe.vercel.app` ou `mailto:…` (contact exigé par les services push, jamais montré aux utilisateurs) |
| `UPSTASH_REDIS_REST_URL` | URL REST Upstash (inutile si l'intégration Vercel a posé `KV_REST_API_URL`) |
| `UPSTASH_REDIS_REST_TOKEN` | token REST Upstash (inutile si `KV_REST_API_TOKEN` existe) |
| `CRON_SECRET` | une longue chaîne aléatoire |
| `STATS_SECRET` | une autre longue chaîne aléatoire |
| `RESEND_API_KEY` | clé API Resend (voir plus bas) |
| `ALERT_EMAIL` | adresse qui reçoit les alertes |
| `MAX_SUBSCRIBERS` | facultatif, plafond d'inscrits (défaut : 8000) |
| `ALERT_FROM` | facultatif, expéditeur si tu as vérifié un domaine sur Resend |

Pour générer les secrets : `openssl rand -hex 32`. Marque `VAPID_PRIVATE_KEY`, `CRON_SECRET`, `STATS_SECRET` et `RESEND_API_KEY` comme **Sensitive**.

4. Redéploie (Deployments > ⋯ > Redeploy) pour que les variables soient prises en compte.

### 4. Alertes mail (tous les 1 000 inscrits)

Les mails partent via [Resend](https://resend.com) (gratuit jusqu'à 3 000 mails/mois, largement suffisant).

1. Crée un compte Resend **avec l'adresse qui doit recevoir les alertes** : sans domaine vérifié, Resend n'autorise l'expéditeur de test `onboarding@resend.dev` qu'à écrire au propriétaire du compte.
2. API Keys > Create API Key (permission *Sending access*), puis copie-la dans `RESEND_API_KEY` sur Vercel.
3. Mets la même adresse dans `ALERT_EMAIL`, puis redéploie.

Un mail part à 1 000, 2 000… inscrits, une seule fois par palier, et un dernier « complet » à 8 000. Si `RESEND_API_KEY` manque, l'inscription fonctionne quand même ; l'alerte est seulement écrite dans les logs Vercel. Les mails venant de `resend.dev` peuvent arriver en spam : pense à vérifier ce dossier au premier palier.

Pour tester la configuration sans attendre 1 000 inscrits :

```bash
curl -H "Authorization: Bearer $STATS_SECRET" https://cogitobe.vercel.app/api/test-mail
# {"sent":true,"to":"…","id":"…"}  ou  {"sent":false,"status":403,"error":"…"} avec la raison donnée par Resend
```

### 5. Envoi horaire avec cron-job.org

Le cron gratuit de Vercel ne tourne qu'une fois par jour, on passe donc par cron-job.org (gratuit) :

1. Crée un compte sur cron-job.org, puis **Create cronjob**.
2. **URL** : `https://cogitobe.vercel.app/api/send`
3. **Execution schedule** : toutes les heures (minute 0, ou une autre minute si tu préfères).
4. Onglet **Advanced** :
   - Request method : `GET` (ou `POST`, les deux sont acceptés)
   - Headers : ajoute `Authorization` avec la valeur `Bearer <CRON_SECRET>`
5. Enregistre, puis lance **Test run** : la réponse doit être un `200` du type
   `{"message":"Crois en toi.","total":12,"sent":11,"removed":1,"failed":0}`

Utilise toujours le domaine de production `cogitobe.vercel.app` : les URLs de déploiement (`cogitobe-xxxx.vercel.app`) sont protégées par la connexion Vercel..

`removed` compte les abonnements expirés (réponse 404/410 du service push), supprimés automatiquement de Redis.

Test manuel :

```bash
curl -H "Authorization: Bearer $CRON_SECRET" https://cogitobe.vercel.app/api/send
```

### 6. Voir les stats

```bash
curl -H "Authorization: Bearer $STATS_SECRET" https://cogitobe.vercel.app/api/stats
# {"subscribers":42}
```

Ou directement dans le navigateur : `https://cogitobe.vercel.app/api/stats?key=<STATS_SECRET>` (pratique, mais le secret apparaît dans l'historique : préfère l'en-tête).

## Développement local

```bash
npm install
cp .env.example .env.local   # puis remplis les valeurs
npx vercel dev
```

Les notifications push fonctionnent sur `http://localhost` (contexte considéré comme sécurisé), pas sur une IP du réseau local.

## Bon à savoir

- **iPhone / iPad** : les notifications web ne marchent qu'une fois le site ajouté à l'écran d'accueil (Partager > Sur l'écran d'accueil) et ouvert depuis l'icône, sur iOS 16.4 ou plus. La page l'explique si on clique depuis Safari.
- Chaque notification a un TTL d'une heure : si le téléphone est éteint, on ne reçoit pas une pile de phrases périmées au réveil.
- Une nouvelle notification remplace la précédente (même `tag`).
- Pour modifier les phrases, édite `messages.json` et redéploie. Chaque entrée : `{ "lang": "fr" | "en", "type": "screen" | "motivation", "text": "…" }`.
- `/api/subscribe` est public par nature. Si le site est spammé, ajoute une limite de débit (par exemple `@upstash/ratelimit` sur la même base).
