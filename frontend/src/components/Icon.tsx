interface IconProps {
  name: string;
  size?: number;
  className?: string;
  strokeWidth?: number;
  style?: React.CSSProperties;
}

export function Icon({ name, size = 18, className = "ico", strokeWidth = 1.8, style }: IconProps) {
  const s = { width: size, height: size, ...style };
  const common = {
    width: size, height: size, viewBox: "0 0 24 24",
    fill: "none" as const, stroke: "currentColor", strokeWidth,
    strokeLinecap: "round" as const, strokeLinejoin: "round" as const,
    className, style: s,
  };
  switch (name) {
    case "dashboard": return (<svg {...common}><rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/></svg>);
    case "tables":    return (<svg {...common}><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>);
    case "orders":    return (<svg {...common}><path d="M4 5h16M4 12h16M4 19h10"/></svg>);
    case "kitchen":   return (<svg {...common}><path d="M5 3v18M19 3v18M3 21h18M9 8h6M9 12h6"/></svg>);
    case "menu":      return (<svg {...common}><path d="M4 5h16M8 5v16M16 5v16M4 12h4M16 12h4"/></svg>);
    case "users":     return (<svg {...common}><circle cx="9" cy="8" r="3.5"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6"/><circle cx="17" cy="7" r="2.5"/><path d="M15 14c2.8 0 5 2 5 5"/></svg>);
    case "money":     return (<svg {...common}><rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M6 9v6M18 9v6"/></svg>);
    case "shift":     return (<svg {...common}><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>);
    case "print":     return (<svg {...common}><path d="M7 8V3h10v5"/><rect x="3" y="8" width="18" height="9" rx="2"/><path d="M7 13h10v6H7z"/></svg>);
    case "analytics": return (<svg {...common}><path d="M3 20V4M3 20h18M7 16l4-5 3 3 5-7"/></svg>);
    case "settings":  return (<svg {...common}><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/></svg>);
    case "logout":    return (<svg {...common}><path d="M16 17l5-5-5-5M21 12H9M13 3H5v18h8"/></svg>);
    case "plus":      return (<svg {...common}><path d="M12 5v14M5 12h14"/></svg>);
    case "minus":     return (<svg {...common}><path d="M5 12h14"/></svg>);
    case "x":         return (<svg {...common}><path d="M6 6l12 12M6 18L18 6"/></svg>);
    case "check":     return (<svg {...common}><path d="M5 12l5 5L20 7"/></svg>);
    case "search":    return (<svg {...common}><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>);
    case "filter":    return (<svg {...common}><path d="M4 5h16l-6 8v5l-4 2v-7L4 5z"/></svg>);
    case "clock":     return (<svg {...common}><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>);
    case "note":      return (<svg {...common}><path d="M5 3h11l3 3v15H5z"/><path d="M8 9h8M8 13h8M8 17h5"/></svg>);
    case "trash":     return (<svg {...common}><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/></svg>);
    case "edit":      return (<svg {...common}><path d="M4 20l4-1 11-11-3-3L5 16l-1 4z"/></svg>);
    case "more":      return (<svg {...common}><circle cx="5" cy="12" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="19" cy="12" r="1.4"/></svg>);
    case "back":      return (<svg {...common}><path d="M15 6l-6 6 6 6"/></svg>);
    case "forward":   return (<svg {...common}><path d="M9 6l6 6-6 6"/></svg>);
    case "up":        return (<svg {...common}><path d="M6 15l6-6 6 6"/></svg>);
    case "down":      return (<svg {...common}><path d="M6 9l6 6 6-6"/></svg>);
    case "bell":      return (<svg {...common}><path d="M6 16V10a6 6 0 1 1 12 0v6l2 2H4l2-2z"/><path d="M10 21h4"/></svg>);
    case "fire":      return (<svg {...common}><path d="M12 3c1 3 4 4 4 8a4 4 0 0 1-8 0c0-2 1-3 1-5"/><path d="M10 15c0 2 1 4 2 4s2-2 2-4-1-3-2-3-2 1-2 3z"/></svg>);
    case "user":      return (<svg {...common}><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.4 3.6-8 8-8s8 3.6 8 8"/></svg>);
    case "receipt":   return (<svg {...common}><path d="M5 3h14v18l-2-1-2 1-2-1-2 1-2-1-2 1-2-1V3z"/><path d="M9 8h6M9 12h6M9 16h4"/></svg>);
    case "card":      return (<svg {...common}><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20M6 15h3"/></svg>);
    case "cash":      return (<svg {...common}><rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/></svg>);
    case "qr":        return (<svg {...common}><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h3v3M21 14v3M14 21h3M21 21v-3"/></svg>);
    case "split":     return (<svg {...common}><path d="M12 3v18M5 8l-2 4 2 4M19 8l2 4-2 4"/></svg>);
    case "percent":   return (<svg {...common}><path d="M5 19L19 5"/><circle cx="7" cy="7" r="2"/><circle cx="17" cy="17" r="2"/></svg>);
    case "refund":    return (<svg {...common}><path d="M4 8h11a5 5 0 1 1 0 10H8"/><path d="M8 4L4 8l4 4"/></svg>);
    case "play":      return (<svg {...common}><path d="M7 5l11 7-11 7V5z" fill="currentColor" stroke="none"/></svg>);
    case "wifi":      return (<svg {...common}><path d="M2 9a16 16 0 0 1 20 0M5 13a10 10 0 0 1 14 0M8.5 16.5a5 5 0 0 1 7 0"/><circle cx="12" cy="20" r="1" fill="currentColor"/></svg>);
    case "barcode":   return (<svg {...common}><path d="M4 5v14M7 5v14M11 5v14M14 5v14M18 5v14M21 5v14"/></svg>);
    case "device":    return (<svg {...common}><rect x="4" y="4" width="16" height="14" rx="2"/><path d="M9 21h6M12 18v3"/></svg>);
    case "tray":      return (<svg {...common}><path d="M3 13h6l1 3h4l1-3h6"/><path d="M5 6h14l2 7v7H3v-7l2-7z"/></svg>);
    case "warning":   return (<svg {...common}><path d="M12 3l10 18H2L12 3z"/><path d="M12 10v4M12 18v.5"/></svg>);
    case "info":      return (<svg {...common}><circle cx="12" cy="12" r="9"/><path d="M12 8h.01M11 12h1v5h1"/></svg>);
    case "sun":       return (<svg {...common}><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M2 12h2M20 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4"/></svg>);
    case "moon":      return (<svg {...common}><path d="M20 14a8 8 0 1 1-9-10 6 6 0 0 0 9 10z"/></svg>);
    case "flag":      return (<svg {...common}><path d="M5 21V4M5 4h12l-2 4 2 4H5"/></svg>);
    case "sort":      return (<svg {...common}><path d="M7 4v16M7 20l-3-3M7 20l3-3M17 20V4M17 4l-3 3M17 4l3 3"/></svg>);
    default:          return (<svg {...common}><circle cx="12" cy="12" r="3"/></svg>);
  }
}
