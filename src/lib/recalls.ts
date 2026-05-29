export type RecallProduct = { Name?: string };
export type Organization = { Name: string };

export type RecallItem = {
  RecallID: string;
  Title: string;
  RecallDate: string;
  URL?: string;
  ConsumerContact?: string;
  Products?: RecallProduct[];
  Retailers?: Organization[];
};

export type RecallCardItem = {
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

export function buildApiUrl(days: number) {
  const today = new Date();
  const start = new Date(today);
  start.setDate(today.getDate() - days);
  return `https://www.saferproducts.gov/RestWebServices/Recall?format=json&field_rc_date_value=${isoDate(start)}&field_rc_date_value_1=${isoDate(today)}&field_rc_recall_by_product_target_id=119`;
}

export function mapRecalls(data: RecallItem[]): RecallCardItem[] {
  return data.slice(0, 10).map(item => ({
    id: item.RecallID,
    name: item.Title,
    reason: item.Products?.[0]?.Name ?? 'No details provided',
    recallDate: item.RecallDate,
    link: item.URL ?? 'https://www.cpsc.gov/Recalls',
    consumerContact: item.ConsumerContact,
    retailers: item.Retailers?.map(r => r.Name) ?? [],
  }));
}

export async function fetchRecalls(days: number): Promise<RecallCardItem[]> {
  const res = await fetch(buildApiUrl(days));
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  const data: RecallItem[] = await res.json();
  return mapRecalls(data);
}
