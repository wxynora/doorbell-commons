import type { CommunityArea, NavigationItemViewModel } from "../view-models";

interface CommunityNavigationProps {
  activeArea: CommunityArea;
  items: readonly NavigationItemViewModel[];
  onSelect: (area: CommunityArea) => void;
}

function NavigationIcon({ icon }: { icon: NavigationItemViewModel["icon"] }) {
  if (icon === "home") {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24">
        <path d="M3 9 12 2l9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" />
        <path d="M9 22V12h6v10" />
      </svg>
    );
  }

  if (icon === "profile") {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24">
        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
        <circle cx="12" cy="7" r="4" />
      </svg>
    );
  }

  if (icon === "map") {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="9" />
        <path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" />
      </svg>
    );
  }

  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

export function CommunityNavigation({ activeArea, items, onSelect }: CommunityNavigationProps) {
  return (
    <nav className="community-navigation" aria-label="社区一级区域">
      {items.map((item) => {
        const active = item.id === activeArea;
        return (
          <button
            aria-label={item.label}
            aria-current={active ? "page" : undefined}
            className={active ? "is-current" : undefined}
            key={item.id}
            onClick={() => onSelect(item.id)}
            type="button"
          >
            <span className="community-navigation__icon">
              <NavigationIcon icon={item.icon} />
            </span>
          </button>
        );
      })}
    </nav>
  );
}
