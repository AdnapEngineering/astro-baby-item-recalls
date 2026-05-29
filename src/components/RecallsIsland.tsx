import { useEffect, useState } from 'react';

type RecallProduct = { Name?: string };
type Organization = { Name: string };
type RecallItem = {
  RecallID: string;
  Title: string;
  RecallDate: string;
  URL?: string;
  ConsumerContact?: string;
  Products?: RecallProduct[];
  Retailers?: Organization[];
};

type RecallCardItem = {
  id: string;
  name: string;
  reason: string;
  recallDate: string;
  link: string;
  consumerContact?: string;
  retailers: string[];
};

function isoDate(date: Date) {
  return date.toISOString().split('T')[0];
}

function buildApiUrl(days: number) {
  const today = new Date();
  const start = new Date(today);
  start.setDate(today.getDate() - days);
  return `https://www.saferproducts.gov/RestWebServices/Recall?format=json&field_rc_date_value=${isoDate(start)}&field_rc_date_value_1=${isoDate(today)}&field_rc_recall_by_product_target_id=119`;
}

function formatDate(raw: string) {
  const d = new Date(raw);
  return isNaN(d.getTime()) ? raw : d.toLocaleDateString(undefined, { dateStyle: 'long' });
}

function SkeletonCard() {
  return (
    <div className="card bg-base-100 shadow-md animate-pulse">
      <div className="card-body gap-3">
        <div className="h-5 bg-base-300 rounded w-3/4" />
        <div className="h-4 bg-base-300 rounded w-1/2" />
        <div className="h-4 bg-base-300 rounded w-1/3" />
      </div>
    </div>
  );
}

export default function RecallsIsland({ days = 7 }: { days?: number }) {
  const [items, setItems] = useState<RecallCardItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(buildApiUrl(days), { cache: 'no-store' });
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      const data: RecallItem[] = await res.json();

      setItems(
        data.slice(0, 10).map(item => ({
          id: item.RecallID,
          name: item.Title,
          reason: item.Products?.[0]?.Name ?? 'No details provided',
          recallDate: item.RecallDate,
          link: item.URL ?? 'https://www.cpsc.gov/Recalls',
          consumerContact: item.ConsumerContact,
          retailers: item.Retailers?.map(r => r.Name) ?? [],
        }))
      );
      setLastUpdated(new Date());
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to fetch recalls.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [days]);

  return (
    <div className="max-w-3xl mx-auto p-4 bg-primary/10 border border-primary rounded-lg">
      <div className="flex items-center justify-between border-b border-primary/30 pb-2 mb-4">
        <h2 className="text-xl font-bold text-primary">Recent Baby Product Recalls</h2>
        {!loading && (
          <button
            onClick={load}
            className="btn btn-xs btn-ghost text-primary"
            aria-label="Refresh recalls"
          >
            ↻ Refresh
          </button>
        )}
      </div>

      <p className="mb-6 text-base-content/80">
        Please check your items against this list for your child's safety.
      </p>

      {error && (
        <div className="alert alert-error mb-4">
          <span>Error: {error}</span>
          <button onClick={load} className="btn btn-sm btn-ghost ml-auto">
            Retry
          </button>
        </div>
      )}

      {lastUpdated && (
        <p className="text-xs opacity-60 mb-3">
          Last updated: {lastUpdated.toLocaleString()}
        </p>
      )}

      <div className="grid gap-4">
        {loading && Array.from({ length: 3 }, (_, i) => <SkeletonCard key={i} />)}

        {!loading && items?.length === 0 && (
          <div className="text-center py-12 text-base-content/60">
            <p className="text-4xl mb-3">✓</p>
            <p className="font-semibold">No recalls in the last {days} days</p>
            <p className="text-sm mt-1">Check back soon to stay up to date.</p>
          </div>
        )}

        {items?.map(item => (
          <div
            key={item.id}
            className="card border-l-4 border-primary bg-base-100 shadow-md"
          >
            <div className="card-body">
              <h3 className="card-title">{item.name}</h3>

              <p>
                <span className="font-semibold">Product:</span> {item.reason}
              </p>
              <p>
                <span className="font-semibold">Recall Date:</span> {formatDate(item.recallDate)}
              </p>

              {item.consumerContact && (
                <div className="collapse collapse-arrow bg-base-200 mt-2">
                  <input type="checkbox" />
                  <div className="collapse-title font-semibold">Contact Information</div>
                  <div className="collapse-content text-sm">{item.consumerContact}</div>
                </div>
              )}

              {item.retailers.length > 0 && (
                <div className="collapse collapse-arrow bg-base-200 mt-2">
                  <input type="checkbox" />
                  <div className="collapse-title font-semibold">Retailers</div>
                  <div className="collapse-content text-sm">
                    <ul className="list-disc list-inside">
                      {item.retailers.map(name => (
                        <li key={name}>{name}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}

              <div className="card-actions justify-end mt-4">
                <a
                  href={item.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn btn-sm btn-primary text-primary-content"
                >
                  Official Notice →
                </a>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
