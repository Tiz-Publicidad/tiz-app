# Consulta ARCA: autenticación CI y despliegue aislado

Rama: `codex/firebase-arca-constancia-v1`, creada desde `346ed4e54a19417c464589bacd73a37f7cbe7369`.
No mergear a main sin autorización. No emitir facturas para verificar este cambio.

## Revisión y causa

- `firebase.json`: Functions en `functions`, runtime Node 22.
- `.firebaserc`: proyecto `tiz---app`.
- `functions/package.json`: entrada `allFunctionsV86.js`; dependencias con lockfile.
- `functions/index.js`: incluye emisión y PDFs; no se modifica.
- `allFunctionsV86.js` ya exporta `arcaPadronConsultarV125`.
- Run 36169646265: instalación OK; falla autenticación con token de usuario no válido. No se puede determinar por ese mensaje si fue revocado o expiró.
- El workflow anterior usaba `--token` y desplegaba todas las Functions.
- Bloqueo preexistente adicional: `functions/facturaDrive2026.js` termina en una expresión incompleta (línea 260); `node --check` falla con `Unexpected end of input`. El entrypoint agregado también falla al cargarlo. No se corrige porque PDFs/emisión están fuera del alcance.

El script `scripts/prepare-arca-constancia.cjs` crea un directorio temporal con exclusivamente el módulo de consulta, el mismo package-lock y las mismas dependencias. Solo en ese paquete temporal cambia `main` a `arcaPadronA5V125.js`. La configuración original y las otras Functions permanecen intactas. El único selector permitido en el workflow es `functions:arcaPadronConsultarV125`; no usar `--force`, borrar funciones ni ejecutar un deploy global con este paquete.

## Contrato ARCA verificado

Manual WSCI v4.1 (marzo 2026) y WSDL productivo consultados el 25/09/2026:

- Servicio WSAA: `ws_sr_constancia_inscripcion` (ya correcto en main).
- Método: `getPersona_v2` (ya correcto en main).
- Namespace: `http://a5.soap.ws.server.puc.sr/` (se conserva).
- Endpoint: `https://aws.arca.gob.ar/sr-padron/webservices/personaServiceA5` (corregido).
- Parámetros: token, sign, cuitRepresentada, idPersona, en ese orden.
- SOAPAction vacío, según binding WSDL.
- Reutiliza los nombres de secretos existentes: `ARCA_PROD_CERTIFICATE_PEM`, `ARCA_PROD_PRIVATE_KEY_PEM`, `ARCA_ISSUER_CUIT`, `ARCA_ALLOWED_EMAILS`.
- No crea ni reemplaza certificados. La relación ARCA autorizada por el usuario se conserva.

## Configuración que debe hacer el administrador

El nuevo workflow usa GitHub OIDC → Workload Identity Federation → cuenta de servicio → ADC. No necesita FIREBASE_TOKEN ni una clave JSON de cuenta de servicio.

No tenemos verificado el estado IAM ni las Variables del proyecto. Un administrador debe configurar o verificar los siguientes recursos. Si ya existen, usar `describe` y revisar su configuración en vez de recrearlos. No compartir claves ni tokens en el chat.

### 1. Crear identidad sin claves

Abrir [Cloud Shell del proyecto](https://console.cloud.google.com/home/dashboard?project=tiz---app) y ejecutar con una cuenta que pueda administrar IAM y Workload Identity Federation:

```bash
set -euo pipefail
TIZ_PROJECT='tiz---app'
TIZ_NUMBER=$(gcloud projects describe "$TIZ_PROJECT" --format='value(projectNumber)')
TIZ_SA="github-arca-constancia@${TIZ_PROJECT}.iam.gserviceaccount.com"

gcloud services enable iam.googleapis.com iamcredentials.googleapis.com sts.googleapis.com --project="$TIZ_PROJECT"
gcloud iam service-accounts create github-arca-constancia --project="$TIZ_PROJECT" --display-name='GitHub deploy ARCA constancia'
gcloud iam workload-identity-pools create github-arca-constancia --project="$TIZ_PROJECT" --location=global --display-name='GitHub ARCA constancia'
gcloud iam workload-identity-pools providers create-oidc tiz-app \
  --project="$TIZ_PROJECT" --location=global \
  --workload-identity-pool=github-arca-constancia \
  --issuer-uri='https://token.actions.githubusercontent.com' \
  --attribute-mapping='google.subject=assertion.sub,attribute.repository_id=assertion.repository_id' \
  --attribute-condition="assertion.repository_owner_id == '322299952' && assertion.repository_id == '1258608377' && assertion.ref == 'refs/heads/codex/firebase-arca-constancia-v1' && assertion.workflow_ref == 'Tiz-Publicidad/tiz-app/.github/workflows/deploy-functions.yml@refs/heads/codex/firebase-arca-constancia-v1' && assertion.event_name == 'workflow_dispatch'"

gcloud iam service-accounts add-iam-policy-binding "$TIZ_SA" \
  --project="$TIZ_PROJECT" --role=roles/iam.workloadIdentityUser \
  --member="principalSet://iam.googleapis.com/projects/${TIZ_NUMBER}/locations/global/workloadIdentityPools/github-arca-constancia/attribute.repository_id/1258608377"
```

La condición restringe organización, repositorio, rama, workflow y ejecución manual. No autoriza main ni pull requests de forks.

### 2. Permisos de despliegue

Consultar primero la Function existente. Este comando solo lee metadatos, nunca valores de secretos:

```bash
gcloud functions describe arcaPadronConsultarV125 --gen2 --region=us-central1 --project="$TIZ_PROJECT" \
  --format='yaml(name,serviceConfig.serviceAccountEmail,serviceConfig.service,buildConfig.serviceAccount)'
```

Si devuelve Not Found, detenerse y revisar el recurso antes de otorgar más permisos. Los comandos siguientes están destinados a actualizar la Function existente.

```bash
for TIZ_ROLE in roles/cloudfunctions.developer roles/firebase.viewer roles/serviceusage.serviceUsageConsumer; do
  gcloud projects add-iam-policy-binding "$TIZ_PROJECT" --member="serviceAccount:${TIZ_SA}" --role="$TIZ_ROLE" --condition=None
done
TIZ_RUNTIME_SA=$(gcloud functions describe arcaPadronConsultarV125 --gen2 --region=us-central1 --project="$TIZ_PROJECT" --format='value(serviceConfig.serviceAccountEmail)')
TIZ_RUN_RESOURCE=$(gcloud functions describe arcaPadronConsultarV125 --gen2 --region=us-central1 --project="$TIZ_PROJECT" --format='value(serviceConfig.service)')
TIZ_BUILD_SA=$(gcloud functions describe arcaPadronConsultarV125 --gen2 --region=us-central1 --project="$TIZ_PROJECT" --format='value(buildConfig.serviceAccount)')
test -n "$TIZ_RUNTIME_SA"
test -n "$TIZ_RUN_RESOURCE"
gcloud iam service-accounts add-iam-policy-binding "$TIZ_RUNTIME_SA" --project="$TIZ_PROJECT" --member="serviceAccount:${TIZ_SA}" --role=roles/iam.serviceAccountUser
if [ -n "$TIZ_BUILD_SA" ]; then
  gcloud iam service-accounts add-iam-policy-binding "${TIZ_BUILD_SA##*/}" --project="$TIZ_PROJECT" --member="serviceAccount:${TIZ_SA}" --role=roles/iam.serviceAccountUser
fi
gcloud run services add-iam-policy-binding "${TIZ_RUN_RESOURCE##*/}" --region=us-central1 --project="$TIZ_PROJECT" --member="serviceAccount:${TIZ_SA}" --role=roles/run.admin
for TIZ_SECRET in ARCA_PROD_CERTIFICATE_PEM ARCA_PROD_PRIVATE_KEY_PEM ARCA_ISSUER_CUIT ARCA_ALLOWED_EMAILS; do
  gcloud secrets add-iam-policy-binding "$TIZ_SECRET" --project="$TIZ_PROJECT" --member="serviceAccount:${TIZ_SA}" --role=roles/secretmanager.viewer
done
```

Cloud Functions Developer permite despliegues a nivel de proyecto; la restricción de destino está en el workflow y su paquete aislado. El permiso Run Admin se limita al servicio de esta Function. Service Account User se limita a sus cuentas de ejecución/build. Secret Manager Viewer permite leer metadatos, no el contenido de claves. La cuenta de ejecución debe conservar su acceso existente a los cuatro secretos; no reemplazarla.

Si un despliegue informa otro permiso faltante, revisar el permiso exacto; no agregar Owner/Editor ni Secret Accessor al deployer por defecto. Los permisos pueden tardar unos minutos en propagarse.

### 3. Guardar dos Variables de GitHub (no Secrets)

Ir a [Settings → Secrets and variables → Actions → Variables](https://github.com/Tiz-Publicidad/tiz-app/settings/variables/actions), botón **New repository variable**.

| Nombre | Valor |
| --- | --- |
| `GCP_DEPLOY_SERVICE_ACCOUNT` | `github-arca-constancia@tiz---app.iam.gserviceaccount.com` |
| `GCP_WORKLOAD_IDENTITY_PROVIDER` | Resultado del comando siguiente |

```bash
gcloud iam workload-identity-pools providers describe tiz-app --project=tiz---app --location=global --workload-identity-pool=github-arca-constancia --format='value(name)'
```

El resultado tiene formato `projects/NUMERO/locations/global/workloadIdentityPools/github-arca-constancia/providers/tiz-app`. Es un identificador público, no una clave.

No eliminar FIREBASE_TOKEN globalmente todavía: otros workflows ajenos a este alcance siguen referenciándolo. Este workflow no lo usa.

## Validación y despliegue

Los pushes de esta rama ejecutan validación sin credenciales y no despliegan. Una ejecución manual valida primero y solo después autentica/despliega.

1. Abrir [Actions / deploy-functions.yml](https://github.com/Tiz-Publicidad/tiz-app/actions/workflows/deploy-functions.yml).
2. **Run workflow**, seleccionar `codex/firebase-arca-constancia-v1` explícitamente. Si la interfaz conserva el nombre viejo de main, identificar el workflow por el archivo `deploy-functions.yml`.
3. Verificar que el job de validación pase y que el único destino del job deploy sea `arcaPadronConsultarV125`.
4. No usar Re-run del run fallido anterior: ejecutaría la versión vieja con token.
5. Guardar URL del run y resultado. No declarar éxito hasta ver deploy completado.

## Prueba real posterior

Solo después del deploy exitoso, iniciar sesión con un usuario autorizado en TIZ App y usar **Consultar ARCA** para un cliente cuyo CUIT se conozca. No usar ningún botón de emisión, anticipo, saldo ni factura de prueba.

Verificar respuesta `ok: true`, CUIT, razón social y domicilio fiscal. La Function actual puede guardar datos fiscales del cliente y de la obra; eso es comportamiento existente, no una consulta estrictamente sin escritura. La prueba offline no accede a ARCA ni demuestra que el certificado esté autorizado. No copiar ID tokens, PEM ni respuestas SOAP con token/sign en logs o chat.

Estado al preparar esta rama: pruebas offline y paquete aislado verificados; deploy y consulta real pendientes de configuración/verificación WIF y sesión autorizada. No se emitió ninguna factura.

## Fuentes

- https://www.afip.gob.ar/ws/WSCI/manual_ws_sr_ws_constancia_inscripcion.pdf
- https://aws.arca.gob.ar/sr-padron/webservices/personaServiceA5?WSDL
- https://firebase.google.com/docs/cli#cli-ci-systems
- https://github.com/google-github-actions/auth
- https://docs.cloud.google.com/functions/docs/concepts/iam
- https://firebase.google.com/docs/functions/manage-functions
