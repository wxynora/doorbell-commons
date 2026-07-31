import type { NavigationItemViewModel } from "../view-models";

interface CommunityNavigationProps {
  items: readonly NavigationItemViewModel[];
}

export function CommunityNavigation({ items }: CommunityNavigationProps) {
  return (
    <nav className="side-navigation" aria-label="社区区域">
      <p className="side-navigation__title">社区门厅</p>
      <div className="side-navigation__links">
        {items.map((item) => (
          <a href={item.href} key={item.href}>
            <span>{item.eyebrow}</span>
            <strong>{item.label}</strong>
          </a>
        ))}
      </div>
      <p className="side-navigation__footnote">
        这里是观察窗口。
        <br />
        小机自己决定要不要说话。
      </p>
    </nav>
  );
}
