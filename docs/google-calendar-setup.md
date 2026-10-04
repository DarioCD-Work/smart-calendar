# Configuración de Google Calendar

La integración usa la API oficial de Google Calendar y Google Identity Services (GIS) con el modelo de token para navegador. Es de solo lectura. El Client ID de una aplicación web es público; no se necesita ni se debe copiar el Client Secret al frontend.

## Google Cloud Console

1. Crea o selecciona un proyecto en [Google Cloud Console](https://console.cloud.google.com/).
2. En **APIs y servicios → Biblioteca**, habilita **Google Calendar API**.
3. En **Google Auth Platform → Branding**, configura el nombre, correo de soporte y datos de contacto de la aplicación.
4. En **Google Auth Platform → Audience**, selecciona el tipo de usuario adecuado. Para una app externa en pruebas, agrega las cuentas Google que la probarán como **Test users**. Completa la verificación de Google si el estado de publicación o los scopes lo requieren.
5. En **Google Auth Platform → Data access**, revisa los permisos de lectura. La app solicita únicamente:
   - `https://www.googleapis.com/auth/calendar.calendarlist.readonly` para enumerar calendarios y sus metadatos.
   - `https://www.googleapis.com/auth/calendar.events.readonly` para leer eventos.
6. En **Google Auth Platform → Clients**, crea un **OAuth client ID** de tipo **Web application**.
7. En **Authorized JavaScript origins**, registra cada origen exacto de desarrollo y producción, sin rutas:
   - `http://localhost:4200` si `ng serve` utiliza el puerto predeterminado.
   - Si Angular eligió otro puerto, por ejemplo, `http://localhost:54890`, agrega también ese origen exacto.
   - El origen HTTPS de producción, por ejemplo, `https://calendar.example.com`.
   No hacen falta redirect URIs para el modelo GIS Token que usa esta integración.
8. Copia el **Client ID** creado (termina en `.apps.googleusercontent.com`) en `src/environments/environment.ts`:

```ts
export const environment = {
  googleCalendar: {
    clientId: 'TU_CLIENT_ID.apps.googleusercontent.com'
  }
};
```

No agregues el Client Secret a este archivo, a otro archivo Angular ni al repositorio. La integración permanece desactivada mientras `clientId` esté vacío.

9. Ejecuta `npm start` y abre el origen que Angular indique. Para la PWA publicada, sirve la aplicación bajo HTTPS y registra exactamente ese mismo origen en Google Cloud Console.

## Cuentas y tokens

La configuración no sensible de la cuenta (`accountId` y email) y las preferencias/colores de sus calendarios se guardan en IndexedDB. Los eventos de Google no se copian allí: se vuelven a consultar para el rango visible. Los access tokens se conservan solo en memoria, nunca en IndexedDB, `localStorage` ni el bundle.

Al abrir la PWA, GIS intenta recuperar en silencio cada cuenta recordada mediante `prompt: 'none'` y `login_hint`. Si la sesión/cookies del navegador lo permiten, los calendarios se cargan automáticamente. Si GIS devuelve `login_required` u otro error que requiera interacción, la cuenta permanece configurada y aparece como **Vuelve a conectar**; pulsa **Reconectar** desde un gesto del usuario. Safari/iPadOS puede impedir la recuperación silenciosa según la sesión y sus políticas de cookies.

GIS Token no entrega un refresh token persistible a una SPA. Para una sesión renovable durante días/semanas sin interacción, la solución adecuada será un backend con OAuth Authorization Code que proteja los refresh tokens; esta versión no añade backend ni Client Secret.

El color de cada evento se resuelve en memoria con esta prioridad: `event.colorId` → `colors.event[colorId].background` → `calendarList.backgroundColor`/paleta del calendario → fallback azul. La respuesta de colores se cachea brevemente en memoria y nunca se copia al evento local.

En Safari/iPadOS, abre **Calendarios → Añadir cuenta de Google** directamente desde la aplicación para iniciar el diálogo OAuth. Si utilizas la pantalla de consentimiento en estado de pruebas, la cuenta debe estar incluida como test user.
