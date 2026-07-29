# Control sindical

Frontend inicial para la gestión contable del Sindicato Empresa Jumbo
Administradora Norte de Copiapó.

## Estado

Prototipo navegable con datos ficticios. Esta versión todavía no se conecta a
Supabase ni procesa archivos reales.

## Tecnologías

- React
- TypeScript
- Vite
- Lucide Icons
- PWA instalable

## Ejecución local

```bash
npm install
npm run dev
```

## Verificación

```bash
npm run lint
npm run build
```

## Principios del proyecto

- Operaciones contables modificadoras solo con conexión.
- Archivos originales inmutables y con huella de integridad.
- Diferencias de conciliación resueltas manualmente y auditadas.
- Acceso mínimo por rol y privacidad desde el diseño.
- Respaldos externos cifrados fuera de Supabase.
