import React, {
  createContext,
  useCallback,
  useContext,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { TooltipDepthContext } from '@/ui/components/GameTooltip';

type DropdownTone = 'cyan' | 'emerald' | 'amber' | 'violet' | 'rose' | 'slate';

export interface DropdownBadge {
  label: string;
  color?: string;
}

export interface DropdownOption {
  value: string;
  label: string;
  description?: string;
  meta?: string;
  group?: string;
  tone?: DropdownTone;
  icon?: ReactNode;
  keywords?: string[];
  badges?: DropdownBadge[];
  disabled?: boolean;
}

export interface GameDropdownProps {
  value: string;
  options: DropdownOption[];
  onChange: (value: string) => void;
  placeholder: string;
  emptyOptionLabel?: string;
  emptyOptionDescription?: string;
  searchPlaceholder?: string;
  disabled?: boolean;
  searchable?: boolean;
  filterable?: boolean;
  align?: 'left' | 'right';
  menuWidth?: number;
  maxHeight?: number;
  size?: 'compact' | 'default';
  triggerTone?: DropdownTone;
  buttonStyle?: CSSProperties;
  menuStyle?: CSSProperties;
  renderValue?: (option: DropdownOption | null) => ReactNode;
  renderOption?: (option: DropdownOption, state: { selected: boolean; active: boolean }) => ReactNode;
  renderDetail?: (option: DropdownOption | null) => ReactNode;
  detailTitle?: string;
  detailEmpty?: ReactNode;
  detailPlacement?: 'right' | 'bottom';
  noResults?: ReactNode;
}

const toneColors: Record<DropdownTone, string> = {
  cyan: '#22d3ee',
  emerald: '#34d399',
  amber: '#f59e0b',
  violet: '#a78bfa',
  rose: '#fb7185',
  slate: '#94a3b8',
};

function getToneColor(tone?: DropdownTone) {
  return tone ? toneColors[tone] : '#94a3b8';
}

function buildSearchText(option: DropdownOption) {
  return [option.label, option.description, option.meta, option.group, ...(option.keywords ?? [])]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

function DefaultValue({ option, placeholder }: { option: DropdownOption | null; placeholder: string }) {
  if (!option) {
    return <span style={{ color: '#64748b' }}>{placeholder}</span>;
  }

  return (
    <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', minWidth: 0 }}>
      <span style={{ color: '#e2e8f0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%' }}>{option.label}</span>
      {(option.description || option.meta) && (
        <span style={{ color: '#64748b', fontSize: 10, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%' }}>
          {option.description ?? option.meta}
        </span>
      )}
    </span>
  );
}

function DefaultOption({ option, selected, active }: { option: DropdownOption; selected: boolean; active: boolean }) {
  const toneColor = getToneColor(option.tone);

  return (
    <div style={{
      display: 'flex',
      alignItems: 'flex-start',
      gap: 8,
      width: '100%',
      minWidth: 0,
    }}>
      <span style={{
        width: 6,
        height: 6,
        borderRadius: '50%',
        marginTop: 6,
        flexShrink: 0,
        background: selected ? toneColor : active ? `${toneColor}bb` : '#334155',
        boxShadow: selected ? `0 0 10px ${toneColor}55` : 'none',
      }} />

      {option.icon && <span style={{ flexShrink: 0, color: toneColor }}>{option.icon}</span>}

      <span style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0, flex: 1 }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
          <span style={{ color: selected ? '#f8fafc' : '#cbd5e1', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {option.label}
          </span>
          {option.badges && option.badges.length > 0 && (
            <span style={{ display: 'flex', gap: 4, flexWrap: 'wrap', minWidth: 0 }}>
              {option.badges.slice(0, 3).map((badge, index) => (
                <span key={`${badge.label}-${index}`} style={{
                  fontSize: 8,
                  padding: '1px 5px',
                  borderRadius: 999,
                  color: badge.color ?? '#94a3b8',
                  border: `1px solid ${(badge.color ?? '#94a3b8')}33`,
                  background: `${badge.color ?? '#94a3b8'}14`,
                  letterSpacing: '0.06em',
                  textTransform: 'uppercase',
                }}>
                  {badge.label}
                </span>
              ))}
            </span>
          )}
        </span>
        {(option.description || option.meta) && (
          <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, minWidth: 0 }}>
            <span style={{ color: '#64748b', fontSize: 10, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {option.description ?? option.meta}
            </span>
            {option.meta && option.description && (
              <span style={{ color: '#475569', fontSize: 10, fontFamily: 'monospace', flexShrink: 0 }}>{option.meta}</span>
            )}
          </span>
        )}
      </span>
    </div>
  );
}

export function GameDropdown({
  value,
  options,
  onChange,
  placeholder,
  emptyOptionLabel,
  emptyOptionDescription,
  searchPlaceholder = 'Search options...',
  disabled = false,
  searchable = true,
  filterable = true,
  align = 'left',
  menuWidth,
  maxHeight = 320,
  size = 'default',
  triggerTone,
  buttonStyle,
  menuStyle,
  renderValue,
  renderOption,
  renderDetail,
  detailTitle,
  detailEmpty,
  detailPlacement = 'right',
  noResults,
}: GameDropdownProps) {
  const emptyEntryValue = '__dropdown-empty__';
  const depth = useContext(TooltipDepthContext);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [groupFilter, setGroupFilter] = useState<string>('all');
  const [hoveredValue, setHoveredValue] = useState<string | null>(null);
  const [popupPos, setPopupPos] = useState({ top: 0, left: 0, width: 280 });

  const deferredSearch = useDeferredValue(search);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const zIndex = 9997 + depth * 4;

  const selectedOption = useMemo(
    () => options.find(option => option.value === value) ?? null,
    [options, value],
  );

  const groups = useMemo(
    () => Array.from(new Set(options.map(option => option.group).filter((group): group is string => !!group))),
    [options],
  );

  const visibleOptions = useMemo(() => {
    const query = deferredSearch.trim().toLowerCase();
    return options.filter(option => {
      if (groupFilter !== 'all' && option.group !== groupFilter) return false;
      if (!query) return true;
      return buildSearchText(option).includes(query);
    });
  }, [deferredSearch, groupFilter, options]);

  const flatEntries = useMemo(() => {
    const entries: Array<{ kind: 'empty'; entryValue: string } | { kind: 'option'; option: DropdownOption; entryValue: string }> = [];
    if (emptyOptionLabel) entries.push({ kind: 'empty', entryValue: emptyEntryValue });
    visibleOptions.forEach(option => entries.push({ kind: 'option', option, entryValue: option.value }));
    return entries;
  }, [emptyEntryValue, emptyOptionLabel, visibleOptions]);

  const activeEntry = useMemo(() => {
    if (!hoveredValue) return null;
    return flatEntries.find(entry => entry.entryValue === hoveredValue) ?? null;
  }, [flatEntries, hoveredValue]);

  const detailOption = useMemo(() => {
    const entry = activeEntry;
    if (entry?.kind === 'option') return entry.option;
    return selectedOption ?? null;
  }, [activeEntry, selectedOption]);

  const computePopupPos = useCallback((preferMeasuredHeight = true) => {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;

    const width = Math.max(menuWidth ?? 280, Math.round(rect.width));
    let left = align === 'right' ? rect.right - width : rect.left;
    const belowTop = rect.bottom + 6;
    let top = belowTop;

    if (left + width > window.innerWidth - 8) left = window.innerWidth - width - 8;
    if (left < 8) left = 8;

    const estimatedHeight = Math.min(maxHeight + 120, 440);
    const measuredHeight = preferMeasuredHeight ? popupRef.current?.getBoundingClientRect().height : undefined;
    const popupHeight = measuredHeight ?? estimatedHeight;
    const spaceBelow = window.innerHeight - rect.bottom - 8;
    const spaceAbove = rect.top - 8;

    const shouldOpenAbove = popupHeight > spaceBelow && spaceAbove > spaceBelow;
    if (shouldOpenAbove) {
      top = rect.top - popupHeight - 6;
    }

    top = Math.min(Math.max(8, top), Math.max(8, window.innerHeight - popupHeight - 8));

    setPopupPos({ top, left, width });
  }, [align, maxHeight, menuWidth]);

  const close = useCallback(() => {
    setOpen(false);
    setSearch('');
    setGroupFilter('all');
    setHoveredValue(null);
  }, []);

  const openMenu = useCallback(() => {
    if (disabled) return;
    computePopupPos(false);
    setOpen(true);
  }, [computePopupPos, disabled]);

  useEffect(() => {
    if (!open) return;
    computePopupPos();
    const onWindowChange = () => computePopupPos();
    window.addEventListener('resize', onWindowChange);
    window.addEventListener('scroll', onWindowChange, true);
    return () => {
      window.removeEventListener('resize', onWindowChange);
      window.removeEventListener('scroll', onWindowChange, true);
    };
  }, [computePopupPos, open]);

  useEffect(() => {
    if (!open) return;
    computePopupPos();
  }, [computePopupPos, detailPlacement, groupFilter, open, search, visibleOptions.length]);

  useEffect(() => {
    if (!open) return;
    const onDocumentMouseDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!triggerRef.current?.contains(target) && !popupRef.current?.contains(target)) {
        close();
      }
    };

    document.addEventListener('mousedown', onDocumentMouseDown, true);

    return () => {
      document.removeEventListener('mousedown', onDocumentMouseDown, true);
    };
  }, [close, open]);

  useEffect(() => {
    if (!open) return;
    setHoveredValue(null);
    if (searchable) {
      const timeoutId = window.setTimeout(() => searchRef.current?.focus(), 10);
      return () => window.clearTimeout(timeoutId);
    }
    return undefined;
  }, [flatEntries, open, searchable, value]);

  useEffect(() => {
    if (hoveredValue && !flatEntries.some(entry => entry.entryValue === hoveredValue)) {
      setHoveredValue(null);
    }
  }, [flatEntries, hoveredValue]);

  const selectValue = useCallback((nextValue: string) => {
    onChange(nextValue);
    close();
  }, [close, onChange]);

  const handleListMouseMove = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement | null;
    const entryElement = target?.closest?.('[data-dropdown-entry]') as HTMLElement | null;
    if (!entryElement) {
      setHoveredValue(null);
      return;
    }

    const nextEntry = entryElement.dataset.dropdownEntry;
    setHoveredValue(nextEntry || null);
  }, []);

  const toneColor = getToneColor(selectedOption?.tone ?? triggerTone);
  const triggerPadding = size === 'compact' ? '7px 9px' : '9px 11px';
  const triggerFontSize = size === 'compact' ? 10 : 11;
  const hasDetailPane = !!renderDetail;
  const contentDirection = detailPlacement === 'bottom' ? 'column' : 'row';

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        onClick={() => (open ? close() : openMenu())}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 10,
          padding: triggerPadding,
          borderRadius: 8,
          border: `1px solid ${open ? `${toneColor}55` : 'rgba(51,65,85,0.65)'}`,
          background: open ? 'rgba(8,51,68,0.24)' : 'rgba(15,23,42,0.72)',
          color: '#cbd5e1',
          fontFamily: 'JetBrains Mono, Fira Code, Consolas, monospace',
          fontSize: triggerFontSize,
          textAlign: 'left',
          boxShadow: open ? `0 0 0 1px ${toneColor}14, 0 0 16px ${toneColor}18` : 'none',
          opacity: disabled ? 0.45 : 1,
          cursor: disabled ? 'not-allowed' : 'pointer',
          ...buttonStyle,
        }}
      >
        <span style={{ minWidth: 0, flex: 1 }}>
          {renderValue ? renderValue(selectedOption) : <DefaultValue option={selectedOption} placeholder={placeholder} />}
        </span>
        <span style={{ color: open ? toneColor : '#475569', flexShrink: 0 }}>{open ? '▴' : '▾'}</span>
      </button>

      {open && createPortal(
        <div
          ref={popupRef}
          className="dropdown-popup"
          style={{
            top: popupPos.top,
            left: popupPos.left,
            width: popupPos.width,
            zIndex,
            ...menuStyle,
          }}
        >
          {searchable && (
            <div style={{ padding: '0 0 10px', borderBottom: '1px solid rgba(15,23,42,0.8)' }}>
              <input
                ref={searchRef}
                type="text"
                value={search}
                onChange={event => setSearch(event.target.value)}
                placeholder={searchPlaceholder}
                style={{
                  width: '100%',
                  boxSizing: 'border-box',
                  padding: size === 'compact' ? '7px 9px' : '8px 10px',
                  borderRadius: 7,
                  border: '1px solid rgba(51,65,85,0.7)',
                  background: 'rgba(15,23,42,0.82)',
                  color: '#e2e8f0',
                  fontSize: 11,
                  outline: 'none',
                }}
              />
            </div>
          )}

          {filterable && groups.length > 1 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, padding: '10px 0 8px' }}>
              <button
                type="button"
                onClick={() => setGroupFilter('all')}
                style={{
                  padding: '3px 8px',
                  borderRadius: 999,
                  border: `1px solid ${groupFilter === 'all' ? `${toneColor}44` : 'rgba(51,65,85,0.6)'}`,
                  background: groupFilter === 'all' ? `${toneColor}16` : 'rgba(15,23,42,0.72)',
                  color: groupFilter === 'all' ? toneColor : '#64748b',
                  fontSize: 9,
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                }}
              >
                All
              </button>
              {groups.map(group => (
                <button
                  key={group}
                  type="button"
                  onClick={() => setGroupFilter(group)}
                  style={{
                    padding: '3px 8px',
                    borderRadius: 999,
                    border: `1px solid ${groupFilter === group ? `${toneColor}44` : 'rgba(51,65,85,0.6)'}`,
                    background: groupFilter === group ? `${toneColor}16` : 'rgba(15,23,42,0.72)',
                    color: groupFilter === group ? toneColor : '#64748b',
                    fontSize: 9,
                  }}
                >
                  {group}
                </button>
              ))}
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: contentDirection, gap: 10, paddingTop: searchable || (filterable && groups.length > 1) ? 2 : 0 }}>
            <div style={{
              flex: hasDetailPane && detailPlacement === 'right' ? '0 0 52%' : 1,
              minWidth: 0,
              maxHeight,
              overflowY: 'auto',
              display: 'flex',
              flexDirection: 'column',
              gap: 4,
            }} onMouseMove={handleListMouseMove} onMouseLeave={() => setHoveredValue(null)}>
              {emptyOptionLabel && (
                <button
                  data-dropdown-entry={emptyEntryValue}
                  type="button"
                  onClick={() => selectValue('')}
                  style={{
                    width: '100%',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'flex-start',
                    gap: 2,
                    padding: size === 'compact' ? '8px 9px' : '9px 10px',
                    borderRadius: 8,
                    border: '1px solid transparent',
                    background: hoveredValue === emptyEntryValue ? 'rgba(148,163,184,0.10)' : 'transparent',
                    color: '#cbd5e1',
                    textAlign: 'left',
                  }}
                >
                  <span>{emptyOptionLabel}</span>
                  {emptyOptionDescription && <span style={{ color: '#64748b', fontSize: 10 }}>{emptyOptionDescription}</span>}
                </button>
              )}

              {visibleOptions.length === 0 ? (
                <div style={{ padding: '14px 10px', color: '#64748b', fontSize: 10, textAlign: 'center' }}>
                  {noResults ?? 'No matching options'}
                </div>
              ) : visibleOptions.map((option, optionIndex) => {
                const selected = option.value === value;
                const active = option.value === hoveredValue;
                return (
                  <button
                    key={option.value}
                    data-dropdown-entry={option.value}
                    type="button"
                    disabled={option.disabled}
                    onClick={() => !option.disabled && selectValue(option.value)}
                    style={{
                      width: '100%',
                      padding: size === 'compact' ? '8px 9px' : '9px 10px',
                      borderRadius: 8,
                      border: selected ? `1px solid ${getToneColor(option.tone)}44` : '1px solid transparent',
                      background: selected
                        ? `${getToneColor(option.tone)}12`
                        : active
                          ? 'rgba(148,163,184,0.10)'
                          : 'transparent',
                      color: option.disabled ? '#475569' : '#cbd5e1',
                      textAlign: 'left',
                      opacity: option.disabled ? 0.5 : 1,
                      cursor: option.disabled ? 'not-allowed' : 'pointer',
                    }}
                  >
                    {renderOption ? renderOption(option, { selected, active }) : <DefaultOption option={option} selected={selected} active={active} />}
                  </button>
                );
              })}
            </div>

            {hasDetailPane && (
              <div style={{
                flex: detailPlacement === 'right' ? '0 0 48%' : '1 0 auto',
                minWidth: 0,
                maxHeight,
                overflowY: 'auto',
                borderLeft: detailPlacement === 'right' ? '1px solid rgba(30,41,59,0.65)' : 'none',
                borderTop: detailPlacement === 'bottom' ? '1px solid rgba(30,41,59,0.65)' : 'none',
                paddingLeft: detailPlacement === 'right' ? 10 : 0,
                paddingTop: detailPlacement === 'bottom' ? 10 : 0,
              }}>
                {detailTitle && (
                  <div style={{
                    marginBottom: 8,
                    fontSize: 9,
                    letterSpacing: '0.12em',
                    textTransform: 'uppercase',
                    color: '#475569',
                  }}>
                    {detailTitle}
                  </div>
                )}
                {detailOption
                  ? renderDetail(detailOption)
                  : detailEmpty ?? <div style={{ color: '#64748b', fontSize: 10 }}>Nothing selected.</div>}
              </div>
            )}
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}