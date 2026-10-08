import { withBase } from '../lib/nav';
import type { RecallSummary } from '../lib/recall-details';

// A React component rather than an .astro one so the same row renders statically on the
// hazard pages and interactively inside the search island.
export default function RecallListItem({ recall }: { recall: RecallSummary }) {
  return (
    <li className="card card-side items-start gap-4 bg-base-200 p-4">
      {recall.imageUrl && (
        <img
          src={recall.imageUrl}
          alt={recall.imageAlt}
          className="h-20 w-20 shrink-0 rounded-md bg-white object-contain"
          loading="lazy"
          decoding="async"
          width={80}
          height={80}
        />
      )}
      <div className="min-w-0 flex-1 space-y-1">
        {/* h2: every list using this sits directly under the page's h1. */}
        <h2 className="font-medium">
          <a href={withBase(`/recalls/${recall.recallId}/`)} className="link link-primary">
            {recall.title}
          </a>
        </h2>
        <p className="text-sm text-base-content/70">
          <time dateTime={recall.recallDate}>{recall.dateLabel}</time>
          {recall.hazardTags.length > 0 && (
            <> · {recall.hazardTags.map(tag => tag.label).join(', ')}</>
          )}
        </p>
        {recall.remedyOptions.length > 0 && (
          <p className="text-sm">
            <span className="font-semibold">Remedy:</span> {recall.remedyOptions.join(', ')}
          </p>
        )}
        {recall.remedy && <p className="line-clamp-2 text-sm">{recall.remedy}</p>}
      </div>
    </li>
  );
}
