import { AGENTS, isAgentSlug } from "@/features/agents/profiles";
import { cx } from "./ui";

/**
 * Accessible fallback avatar: a coloured disc with the agent's initial and
 * role mark. When a Masky avatar URL is configured it is shown instead; alt
 * text always names the agent and states it is synthetic.
 */
export function AgentAvatar({
  slug,
  size = 40,
  avatarUrl,
  className,
}: {
  slug: string;
  size?: number;
  avatarUrl?: string | null;
  className?: string;
}) {
  if (!isAgentSlug(slug)) return null;
  const a = AGENTS[slug];
  const label = `${a.displayName}, ${a.title} (synthetic AI agent)`;
  if (avatarUrl)
    // eslint-disable-next-line @next/next/no-img-element
    return (
      <img
        src={avatarUrl}
        alt={label}
        width={size}
        height={size}
        className={cx("rounded-full object-cover ring-2 ring-white", className)}
      />
    );
  return (
    <svg
      role="img"
      aria-label={label}
      width={size}
      height={size}
      viewBox="0 0 40 40"
      className={cx("shrink-0", className)}
    >
      <circle cx="20" cy="20" r="20" fill={a.accentColor} />
      <circle
        cx="20"
        cy="20"
        r="17"
        fill="none"
        stroke="white"
        strokeOpacity="0.25"
      />
      <text
        x="20"
        y="21"
        textAnchor="middle"
        dominantBaseline="middle"
        fontSize="17"
        fontWeight="600"
        fill="white"
        fontFamily="system-ui, sans-serif"
      >
        {a.displayName[0]}
      </text>
      <circle cx="31" cy="31" r="7" fill="white" />
      <text
        x="31"
        y="31.5"
        textAnchor="middle"
        dominantBaseline="middle"
        fontSize="8"
        fill={a.accentColor}
      >
        {a.glyph}
      </text>
    </svg>
  );
}
