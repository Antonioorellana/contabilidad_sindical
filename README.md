# Control sindical

Aplicación web para la gestión contable del Sindicato Empresa Jumbo
Administradora Norte de Copiapó.

## Estado

La pantalla de inicio todavía utiliza cifras demostrativas. El módulo de cargas
mensuales ya está conectado al proyecto remoto de Supabase y permite:

- acceso sin registro público mediante enlace temporal;
- creación de ciclos de descuento y recaudación;
- lectura local de XLSX y CSV con encabezados variables;
- archivo privado de XLS, PDF, XLSX y CSV;
- huella SHA-256 e inmutabilidad del original;
- staging de filas ambiguas para revisión manual;
- separación entre prevalidación y contabilización.

## Tecnologías

- React
- TypeScript
- Vite
- Supabase
- read-excel-file
- Lucide Icons
- PWA instalable

## Ejecución local

```bash
npm install
cp .env.example .env.local
npm run dev
```

## Verificación

```bash
npm run lint
npm test
npm run build
```

## Principios del proyecto

- Operaciones contables modificadoras solo con conexión.
- Archivos originales inmutables y con huella de integridad.
- Diferencias de conciliación resueltas manualmente y auditadas.
- Acceso mínimo por rol y privacidad desde el diseño.
- Respaldos externos cifrados fuera de Supabase.

## Alcance de la marcha blanca

- Julio y agosto de 2026 aceptan planillas heredadas.
- Los XLS antiguos y PDF se archivan, pero no se interpretan automáticamente.
- Una prevalidación correcta no crea deudas, cuotas ni asientos.
- Las diferencias se resuelven manualmente antes de contabilizar.
