# Supabase

Esta carpeta contiene la configuración local y las migraciones versionadas.
El proyecto remoto Free está operativo en la región `sa-east-1`.

## Arquitectura de seguridad

- El navegador utiliza únicamente `VITE_SUPABASE_URL` y
  `VITE_SUPABASE_ANON_KEY`.
- La clave `service_role` nunca se utiliza en React ni se almacena en GitHub.
- Todas las tablas tienen Row Level Security habilitado.
- Los archivos contables viven en el bucket privado `accounting-private`.
- Los archivos originales no admiten actualización ni eliminación.
- Las aprobaciones de presidencia se ejecutan mediante funciones controladas.

## Estado del proyecto remoto

Las migraciones `202607290001`, `202607290002` y `202607290003` se aplicaron
manualmente mediante SQL Editor. Antes del primer `supabase db push` debe
repararse el historial del CLI para marcarlas como aplicadas y evitar que se
intenten ejecutar por segunda vez.

Bootstrap completado:

- Primera cuenta de tesorería confirmada administrativamente.
- Perfil `sindicato` activo desde el 1 de julio de 2026.
- URL productiva y redirecciones exactas configuradas.

Pendientes:

1. Crear la cuenta separada de presidencia cuando corresponda.
2. Enlazar el proyecto mediante Supabase CLI y reparar el historial:

   ```bash
   supabase link --project-ref TU_PROJECT_REF
   supabase migration repair 202607290001 --status applied
   supabase migration repair 202607290002 --status applied
   supabase migration repair 202607290003 --status applied
   ```

Las variables públicas ya están configuradas localmente y en Vercel. No deben
documentarse ni versionarse sus valores.

## Inicio de roles

Las tablas `profiles` y `office_assignments` no permiten autoasignación desde el
navegador. El primer acceso debe inicializarse mediante SQL Editor o una tarea
administrativa con `service_role`.

Ejemplo que debe adaptarse con UUID y fechas reales:

```sql
insert into public.profiles (id, display_name)
values
  ('UUID_TESORERIA', 'Tesorería'),
  ('UUID_PRESIDENCIA', 'Presidencia');

insert into public.office_assignments (user_id, role, starts_on, ends_on)
values
  ('UUID_TESORERIA', 'treasurer', date '2026-01-01', null),
  ('UUID_PRESIDENCIA', 'president', date '2026-01-01', null);
```

No se deben usar UUID de ejemplo en producción.
