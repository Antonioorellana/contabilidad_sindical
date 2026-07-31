# Control sindical

Aplicación web para la gestión contable del Sindicato Empresa Jumbo
Administradora Norte de Copiapó.

## Estado

La aplicación ya no muestra cifras demostrativas. Inicio, cargas mensuales,
cuentas de socios y conciliación consultan exclusivamente datos persistidos en
Supabase. Los módulos todavía no implementados muestran un estado vacío explícito.

El circuito operativo actual permite:

- acceso sin registro público mediante enlace temporal;
- creación de ciclos de descuento y recaudación;
- lectura local de XLSX y CSV con encabezados variables;
- archivo privado de XLS, PDF, XLSX y CSV;
- huella SHA-256 e inmutabilidad del original;
- staging de filas ambiguas para revisión manual;
- actualización confirmada del padrón desde la hoja real de cuota social de Jumbo;
- descarte auditable de cargas sin eliminar evidencia;
- consulta del padrón por activos, inactivos, revisión o todos;
- tablero real con socios, montos informados, observaciones y fuentes disponibles;
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
