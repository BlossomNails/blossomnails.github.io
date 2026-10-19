# Conectar la base de datos (Supabase)

Sin esto, la web y el panel funcionan en **modo demo**: todo queda guardado solo en el navegador donde se usa, así que las reservas de las clientas no le llegan a Mica. Con Supabase, las reservas, la agenda, las clientas y los servicios quedan en una base de datos y Mica los ve desde cualquier dispositivo.

Supabase es gratis para este tamaño de negocio. Se hace una sola vez y lleva unos 15 minutos.

## 1. Crear el proyecto

1. Entrá a [supabase.com](https://supabase.com), creá una cuenta y tocá **New project**.
2. Nombre: `blossom`. Región: **South America (São Paulo)**, que es la más cercana a Paraguay.
3. Guardá la contraseña de la base de datos en un lugar seguro (no se usa en la web).

## 2. Crear las tablas

1. En el menú de la izquierda: **SQL Editor** → **New query**.
2. Pegá todo el contenido de `supabase/schema.sql` y tocá **Run**.

Crea las tablas, la seguridad (las clientas solo pueden reservar; no pueden ver datos de otras clientas) y carga los servicios, precios y horarios actuales. Se puede volver a correr sin perder datos.

## 3. Crear el usuario de Mica

1. **Authentication** → **Sign In / Providers**: apagá **Allow new users to sign up**, para que nadie más pueda crearse una cuenta.
2. **Authentication** → **Users** → **Add user** → **Create new user**: el email de Mica y una contraseña. Marcá **Auto Confirm User**.
3. Volvé a **SQL Editor** y corré esta línea con su email:

   ```sql
   insert into public.admins (user_id) select id from auth.users where email = 'EMAIL-DE-MICA';
   ```

Solo los usuarios que están en `admins` pueden entrar al panel. Para sumar a otra persona más adelante, se repiten los pasos 2 y 3 con su email.

## 4. Conectar la web

1. **Project Settings** → **API**. Copiá **Project URL** y la clave **anon public**.
2. Pegalas en `config.js`:

   ```js
   window.BLOSSOM_CONFIG = {
     supabaseUrl: "https://xxxxxxxx.supabase.co",
     supabaseAnonKey: "eyJhbGciOi...",
   };
   ```

La clave *anon* está pensada para ir en la web: lo que permite hacer lo limita `schema.sql`. La otra clave (*service_role*) **no** se pone nunca en la web.

## 5. Publicar

Cualquier hosting de archivos estáticos sirve (Netlify, Cloudflare Pages, GitHub Pages). Hay que subir:

```
index.html  admin.html  admin.webmanifest
app.js  admin.js  core.js  config.js
styles.css  admin.css  images/
```

`context/`, `supabase/` y los `.md` no hace falta subirlos.

Después:

- En Supabase → **Authentication** → **URL Configuration**, poné la dirección de la web en **Site URL**.
- Cambiá el link de la bio de Instagram por la dirección nueva.
- Mica entra a su panel en `dirección-de-la-web/admin.html` (también hay un enlace "Acceso del salón" al pie de la página del salón). Desde el celular puede usar **Agregar a pantalla de inicio** para tenerlo como app.

## Para tener en cuenta

- En el plan gratis, Supabase pausa los proyectos que pasan **7 días sin ningún uso**. Con la web recibiendo visitas no pasa, pero si se pausa se reactiva desde el panel de Supabase con un clic.
- Desde **Ajustes → Descargar una copia** Mica puede bajar todos sus datos cuando quiera.
- La primera vez, conviene probar una reserva desde un celular y verla aparecer en el panel.
