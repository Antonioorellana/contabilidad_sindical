# Supabase

Esta carpeta contiene la configuración local y las migraciones versionadas.
Todavía no está enlazada a un proyecto remoto.

## Arquitectura de seguridad

- El navegador utiliza únicamente `VITE_SUPABASE_URL` y
  `VITE_SUPABASE_ANON_KEY`.
- La clave `service_role` nunca se utiliza en React ni se almacena en GitHub.
- Todas las tablas tienen Row Level Security habilitado.
- Los archivos contables viven en el bucket privado `accounting-private`.
- Los archivos originales no admiten actualización ni eliminación.
- Las aprobaciones de presidencia se ejecutan mediante funciones controladas.

## Preparación del proyecto remoto

1. Crear un proyecto Supabase Free.
2. Elegir una región y registrar formalmente dónde se alojarán los datos.
3. Desactivar el registro público de usuarios.
4. Enlazar el proyecto mediante Supabase CLI.
5. Aplicar las migraciones:

   ```bash
   supabase link --project-ref TU_PROJECT_REF
   supabase db push
   ```

6. Crear manualmente las primeras cuentas de tesorería y presidencia.
7. Insertar sus perfiles y asignaciones de cargo utilizando SQL Editor con los
   UUID generados por Supabase Auth.
8. Configurar las variables públicas en `.env.local` y posteriormente en
   Vercel.

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
