export default function App() {
  return (
    <div style={{ fontFamily: "system-ui, sans-serif", padding: 24 }}>
      <h1>Mirrorball</h1>
      <p>Simple image upload/list site with role-based access.</p>
      <h3>Env</h3>
      <ul>
        <li>API: {import.meta.env.VITE_API_BASE_URL ?? "(unset)"}</li>
        <li>
          UserPool: {import.meta.env.VITE_USER_POOL_ID ?? "(unset)"} /{" "}
          {import.meta.env.VITE_USER_POOL_CLIENT_ID ?? "(unset)"}
        </li>
        <li>CloudFront: {import.meta.env.VITE_CLOUDFRONT_DOMAIN ?? "(unset)"}</li>
      </ul>
    </div>
  );
}
