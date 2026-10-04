# SmartCalendar

This project was generated using [Angular CLI](https://github.com/angular/angular-cli) version 19.2.6.

## Development server

To start a local development server, run:

```bash
ng serve
```

Once the server is running, open your browser and navigate to `http://localhost:4200/`. The application will automatically reload whenever you modify any of the source files.

## Code scaffolding

Angular CLI includes powerful code scaffolding tools. To generate a new component, run:

```bash
ng generate component component-name
```

For a complete list of available schematics (such as `components`, `directives`, or `pipes`), run:

```bash
ng generate --help
```

## Building

To build the project run:

```bash
ng build
```

This will compile your project and store the build artifacts in the `dist/` directory. By default, the production build optimizes your application for performance and speed.

## Running unit tests

To execute unit tests with the [Karma](https://karma-runner.github.io) test runner, use the following command:

```bash
ng test
```

## Running end-to-end tests

For end-to-end (e2e) testing, run:

```bash
ng e2e
```

Angular CLI does not come with an end-to-end testing framework by default. You can choose one that suits your needs.

## Additional Resources

For more information on using the Angular CLI, including detailed command references, visit the [Angular CLI Overview and Command Reference](https://angular.dev/tools/cli) page.

## Google Calendar

La integración es de solo lectura y requiere un OAuth Client ID público. Consulta la [guía de configuración de Google Calendar](docs/google-calendar-setup.md) para configurar Google Cloud Console, los orígenes autorizados y la reconexión OAuth de la PWA.

## Tiempo y resumen de Hoy

El tiempo utiliza las APIs públicas de previsión y geocodificación de [Open-Meteo](https://open-meteo.com/) sin claves privadas, para uso no comercial conforme a sus condiciones. Los datos de ubicaciones proceden de GeoNames. Selecciona una localidad en Ajustes > Tiempo; no se solicita geolocalización. Las coordenadas, el interruptor y el último dato se guardan en el almacén IndexedDB `appPreferences`, sin migrar la base de datos.

La previsión se actualiza aproximadamente cada 30 minutos y al volver a primer plano o recuperar conexión si el dato no es reciente. Sin conexión se conserva la última lectura. El indicador Google muestra la comunicación y autorización de cada cuenta, independientemente de los filtros. El botón de lista junto a Hoy resume la fecha real con las mismas reglas de visibilidad y recurrencia del calendario, sin cambiar el periodo que se está consultando.

## Copias de seguridad

Ajustes > Copia de seguridad permite descargar un archivo `smart-calendar-backup-YYYY-MM-DD.json`. En dispositivos con Web Share también aparece Guardar archivo para guardarlo en Archivos o compartirlo mediante el sistema. La copia contiene los eventos locales completos, categorías, preferencias de calendarios, cuentas Google no sensibles, filtros y configuración de vista/tiempo. No contiene tokens, credenciales, eventos descargados de Google ni caché meteorológica.

El formato `smart-calendar-backup`, versión 1, se valida antes de mostrar una confirmación. Restaurar sustituye las seis stores en una única transacción IndexedDB; si una escritura falla, se revierte todo. Solo después del commit se muestra el éxito y se recarga la aplicación automáticamente. Google puede necesitar reconexión y el tiempo vuelve a consultar su ubicación guardada. Las fechas locales siguen siendo strings `YYYY-MM-DD`, sin conversiones de zona horaria. Guarda una copia fuera del dispositivo: si Safari elimina IndexedDB, también elimina los datos locales, no el archivo que hayas guardado.
