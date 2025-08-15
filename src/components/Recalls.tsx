import { useEffect, useState } from 'react';

export default function Recalls() {
  const [items, setItems] = useState(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const today = new Date();
    const sevenDaysAgo = new Date(today);
    sevenDaysAgo.setDate(today.getDate() - 7);

    const fmt = (d: Date) => d.toISOString().split('T')[0];
    const url = `https://www.saferproducts.gov/RestWebServices/Recall?format=json&field_rc_date_value=${fmt(sevenDaysAgo)}&field_rc_date_value_1=${fmt(today)}&field_rc_recall_by_product_target_id=119`;

    (async () => {
      try {
        const res = await fetch(url, { cache: 'no-store' });
        if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
        const data = await res.json();
        setItems(data.slice(0, 10));
      } catch (e: any) {
        setError(e.message ?? 'Failed to fetch recalls.');
      }
    })();
  }, []);

  if (error) return <div className="alert alert-error">API error: {error}</div>;
  if (!items) return <div className="loading loading-spinner" />;

  return (
    <ul className="grid gap-4">
      {items.map((it: any) => (
        <li key={it.RecallID} className="card border-l-4 border-primary bg-base-100 shadow-md">
          <div className="card-body">
            <h3 className="card-title">{it.Title}</h3>
            <p>
              <span className="font-semibold">Recall Date:</span>{' '}
              {new Date(it.RecallDate).toLocaleDateString()}
            </p>
            <a
              className="btn btn-sm btn-primary"
              href={it.URL ?? 'https://www.cpsc.gov/Recalls'}
              target="_blank"
              rel="noreferrer"
            >
              Official Notice →
            </a>
          </div>
        </li>
      ))}
    </ul>
  );
}
