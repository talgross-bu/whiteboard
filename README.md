# Tal's Whiteboard

A classroom whiteboard at one permanent address:
**<https://talgross-bu.github.io/whiteboard/>**

Students open the page, type a spokesperson's name, draw, and press Submit.
The instructor clicks the padlock at the foot of the page, types the
password, and gets a gallery of every drawing to project and talk through.

There are no accounts. The site is a static page on GitHub Pages; the
drawings live in Neon Postgres and are reached through Neon's Data API
using an anonymous token the browser fetches for itself.

## The instructor password

It lives in one line of `src/whiteboard-configuration.ts`:

```ts
export const INSTRUCTOR_PASSWORD = 'the_secret_word'
```

Changing it means editing that line, committing, and letting the site
rebuild. The password is visible to anyone who reads the site's source.
It keeps students from wandering into the gallery; it is not a lock.
Anyone who reads the source can also call the Data API directly and open,
close, or clear the gallery. That is the price of having no server, and it
is deliberate.

## Setting up Neon

Once, in the [Neon console](https://console.neon.tech):

1. Create a free project. Any AWS region near the class will do.
2. Under **Postgres database > Data API**, tick **Use Managed Better
   Auth** and enable the Data API. Leave **Grant public schema access**
   unticked — the setup script below grants exactly what is needed.
3. Copy the **Auth URL** and the **Data API URL**.
4. Paste `database/setup-whiteboard-database.sql` into the **SQL Editor**
   and run it. It is safe to run again. Then click **Refresh schema
   cache** on the Data API page.
5. Set the allowed origins in both the Data API's CORS settings and Neon
   Auth's domain settings:
   - `https://talgross-bu.github.io` — the published site, without
     `/whiteboard/`
   - `http://localhost:5173` — only needed to run or test it locally

   Leaving the Data API's allowed origins empty permits every origin,
   which is worth avoiding. If the site ever reports that it cannot reach
   the database while the network is plainly fine, this is the setting to
   check first.

Then check it worked:

```sh
cp .env.example .env     # paste the two URLs into it
npm install
npm run probe-neon
```

The probe submits a drawing at the 1 MiB ceiling, replaces it, clears the
gallery, and confirms a save from before the clear is refused. It leaves
the gallery empty and submissions closed.

## Running it locally

```sh
npm install
npm run dev
```

## Deploying

The site rebuilds and republishes on every push to `main`.

Once, in the GitHub repository:

- **Settings > Pages**: set the source to **GitHub Actions**.
- **Settings > Secrets and variables > Actions > Variables**: add
  `VITE_NEON_AUTH_URL` and `VITE_NEON_DATA_API_URL`.

No Postgres password or Neon API key belongs in this repository, in the
repository variables, or in the browser. Only those two public endpoint
URLs.

## Running a class

1. Unlock the gallery with the padlock.
2. Press **Open submissions**. The board starts closed, and stays however
   you last left it.
3. Students draw and submit. The gallery refreshes every five seconds.
4. Click a drawing to present it. Arrow keys move between drawings,
   Escape closes, and **Full screen** hides the browser's own toolbars
   where the browser allows it.
5. **Clear all drawings** between activities. It asks first and tells you
   how many it is about to delete. Students keep their own copy and can
   submit again into the fresh gallery.

## Checking it before a class

```sh
npm run load-test
```

Sends a classroom's worth of synthetic traffic at the real database: 250
page visitors, then 65 browsers submitting at once, then the same 65
replacing their drawings. It clears the gallery and closes submissions
when it is done.

## How it is put together

| Path | What it holds |
| --- | --- |
| `src/whiteboard-configuration.ts` | The password, the sizes, the colours, the refresh interval |
| `src/drawing/` | Strokes, the renderer, and the undo history |
| `src/components/` | The student page, the padlock, the gallery, the presentation view |
| `src/neon-client.ts` | The only place the app talks to the database |
| `src/local-storage.ts` | Every browser-storage key, in one file |
| `database/setup-whiteboard-database.sql` | Tables, functions, and grants |
| `scripts/` | The Neon probe and the load test |

The board is a list of strokes in 1200 × 900 coordinates, and the canvas
is a picture of that list. That is why resizing the window, rotating a
tablet, and exporting the PNG all work without any special handling: they
are the same strokes drawn at a different scale.

The database never exposes a table. Seven functions in `public` are the
whole surface: read the status, submit, list the gallery, fetch
thumbnails, fetch one full image, open or close, and clear. They enforce
the open/closed setting, the size limits, and the name length, and they
refuse a save that belongs to a gallery that has since been cleared.
