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
  retailers?: string[];
};

function iso(date: Date) {
  return date.toISOString().split('T')[0];
}

function buildApiUrl(days = 7) {
  const today = new Date();
  const start = new Date(today);
  start.setDate(today.getDate() - days);
  const startDate = iso(start);
  const endDate = iso(today);
  return `https://www.saferproducts.gov/RestWebServices/Recall?format=json&field_rc_date_value=${startDate}&field_rc_date_value_1=${endDate}&field_rc_recall_by_product_target_id=119`;
}

export default function RecallsIsland({ days = 7 }: { days?: number }) {
  const [items, setItems] = useState<RecallCardItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  async function load() {
    try {
      setError(null);
      const res = await fetch(buildApiUrl(days), { cache: 'no-store' });
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      const data: RecallItem[] = await res.json();

      const mapped: RecallCardItem[] = data.slice(0, 10).map(item => ({
        id: item.RecallID,
        name: item.Title,
        reason: item.Products?.[0]?.Name || 'No details provided',
        recallDate: item.RecallDate,
        link: item.URL || 'https://www.cpsc.gov/Recalls',
        consumerContact: item.ConsumerContact,
        retailers: item.Retailers?.map(r => r.Name) || [],
      }));

      setItems(mapped);
      setLastUpdated(new Date());
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to fetch recalls.');
    }
  }

  useEffect(() => {
    load();
  }, [days]);

  return (
    <div className="max-w-3xl mx-auto p-4 bg-primary/10 border border-primary rounded-lg">
      <h2 className="text-xl font-bold text-primary border-b border-primary/30 pb-2 mb-4">
        Recent Baby Product Recalls
      </h2>

      <p className="mb-6 text-base-content/80">
        Please check your items against this list for your child's safety.
      </p>

      {error && (
        <div className="alert alert-error mb-4">
          <span>API error: {error}</span>
        </div>
      )}

      {lastUpdated && (
        <div className="text-xs opacity-70 mb-3">Last updated: {lastUpdated.toLocaleString()}</div>
      )}

      <div className="grid gap-4">
        {!items && !error && (
          <div className="loading loading-spinner loading-lg mx-auto my-8" aria-label="Loading" />
        )}

        {items?.map(item => (
          <div
            key={item.id}
            className="card border-l-4 border-primary bg-base-100 shadow-md"
            id={item.id}
          >
            <div className="card-body">
              <h3 className="card-title">{item.name}</h3>

              <p>
                <span className="font-semibold">Reason for Recall:</span> {item.reason}
              </p>
              <p>
                <span className="font-semibold">Recall Date:</span>{' '}
                {new Date(item.recallDate).toLocaleDateString()}
              </p>

              {item.consumerContact && (
                <div className="collapse collapse-arrow bg-base-200">
                  <input type="checkbox" />
                  <div className="collapse-title font-semibold">Contact Information</div>
                  <div className="collapse-content text-sm">{item.consumerContact}</div>
                </div>
              )}

              {item.retailers?.length ? (
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
              ) : null}

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
