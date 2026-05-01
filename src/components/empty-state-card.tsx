import { useLocation } from "wouter";
import "./empty-state-card.css";

interface EmptyStateCardProps {
  title: string;
  description: string;
  cta: { label: string; to: string };
  caption?: string;
}

export function EmptyStateCard({
  title,
  description,
  cta,
  caption,
}: EmptyStateCardProps) {
  const [, setLocation] = useLocation();

  return (
    <article className="empty-card">
      <h2 className="text-h2 empty-card-title">{title}</h2>
      <p className="text-body-large empty-card-description">{description}</p>
      <button
        type="button"
        className="btn-primary empty-card-cta"
        onClick={() => setLocation(cta.to)}
      >
        {cta.label}
      </button>
      {caption && <p className="text-caption empty-card-caption">{caption}</p>}
    </article>
  );
}
