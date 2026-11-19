import { summarizeProducts } from '../lib/format';
import { withBase } from '../lib/nav';
import type { RecallSummary } from '../lib/recall-details';

// A React component rather than an .astro one so the same row renders statically on the
// hazard and product pages and interactively inside the search island.
export default function RecallListItem({
  recall,
  headingLevel = 2,
}: {
  recall: RecallSummary;
  /** One below the heading the list sits under, so the outline never skips a level. */
  headingLevel?: 2 | 3;
}) {
  const Heading = `h${headingLevel}` as const;
  const products = summarizeProducts(recall.productIdentifiers);
  return (
    <li className="surface card card-side items-start gap-3 p-4 sm:gap-4">
      {recall.imageUrl && (
        <img
          src={recall.imageUrl}
          alt={recall.imageAlt}
          className="h-16 w-16 shrink-0 rounded-md bg-white object-contain sm:h-20 sm:w-20"
          loading="lazy"
          decoding="async"
          width={80}
          height={80}
        />
      )}
      <div className="min-w-0 flex-1 space-y-1">
        <Heading className="leading-snug font-semibold">
          <a
            href={withBase(`/recalls/${recall.recallId}/`)}
            className="link link-primary link-hover"
          >
            {recall.title}
          </a>
        </Heading>
        <p className="flex flex-wrap items-center gap-1.5 text-sm text-base-content/70">
          <time dateTime={recall.recallDate} className="mr-1">
            {recall.dateLabel}
          </time>
          {/* Same colours as the recall page's badges: blue for what it is, amber for the danger. */}
          {recall.productTypes.map(type => (
            <span key={type.slug} className="badge badge-sm badge-info">
              <span className="sr-only">Product type: </span>
              {type.label}
            </span>
          ))}
          {recall.hazardTags.map(tag => (
            <span key={tag.slug} className="badge badge-sm badge-warning">
              <span className="sr-only">Hazard: </span>
              {tag.label}
            </span>
          ))}
        </p>
        {products.text && (
          <p className="text-sm">
            <span className="font-semibold">Product:</span> {products.text}
            {products.more > 0 && (
              <span className="text-base-content/70"> +{products.more} more</span>
            )}
          </p>
        )}
        {recall.remedyOptions.length > 0 && (
          <p className="text-sm">
            <span className="font-semibold">Remedy:</span> {recall.remedyOptions.join(', ')}
          </p>
        )}
        {/* Clipped to two lines; the recall page carries the full remedy. */}
        {recall.remedy && <p className="line-clamp-2 text-sm">{recall.remedy}</p>}
      </div>
    </li>
  );
}
