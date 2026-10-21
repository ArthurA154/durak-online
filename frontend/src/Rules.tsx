import { TURN_CHOICES, type RoomSettings, type TurnSeconds } from '@durak/shared';
import { Popover } from './Popover';
import { Segmented } from './Segmented';
import { t } from './i18n';

/** Regeln eines Raums als Paare „Beschriftung – gewählter Wert“ für die Zusammenfassung */
function ruleRows(s: RoomSettings, showRoom?: boolean) {
  return [
    ...(showRoom ? [{ label: t('room'), value: t(s.public ? 'public' : 'private') }] : []),
    // Ohne Weiterschieben reicht der Name der Variante
    s.transfer ? { label: t('transferRule'), value: t('transferOn') } : { label: '', value: t('podkidnoy') },
    { label: t('turnTime'), value: t('secondsShort', { n: s.turnSeconds }) },
    { label: t('throwIn'), value: t(s.neighborsOnly ? 'neighborsOnly' : 'all') },
    { label: t('attackLimit'), value: t(s.unlimited ? 'unlimited' : 'max6') },
    { label: t('hints'), value: t(s.hints ? 'hintsOn' : 'hintsOff') },
  ];
}

/** Nur ansehen: kompakte Chips statt ausgegrauter Umschalter (Mitspieler in der Lobby, alle im Spiel) */
export function RuleSummary(props: { settings: RoomSettings; showRoom?: boolean }) {
  return (
    <ul className="rule-chips">
      {ruleRows(props.settings, props.showRoom).map((r) => (
        <li key={r.label || r.value} className="rule-chip">
          {r.label && <span>{r.label} </span>}
          {r.value}
        </li>
      ))}
    </ul>
  );
}

/** Die Regeln des Raums als Umschalter – nur für den Gastgeber in der Lobby. */
export function RuleControls(props: {
  settings: RoomSettings;
  onChange: (change: Partial<RoomSettings>) => void;
  /** Privat/Öffentlich mit anzeigen (nur in der Lobby sinnvoll) */
  showRoom?: boolean;
}) {
  const { settings: s, onChange: set } = props;
  return (
    <div className="room-settings">
      {props.showRoom && (
        <Segmented
          label={t('room')}
          value={s.public}
          options={[
            { value: false, label: t('private') },
            { value: true, label: t('public') },
          ]}
          onChange={(v) => set({ public: v })}
        />
      )}
      <Segmented
        label={t('transferRule')}
        value={s.transfer}
        options={[
          { value: true, label: t('transferOn') },
          { value: false, label: t('transferOff') },
        ]}
        onChange={(v) => set({ transfer: v })}
      />
      <Segmented<TurnSeconds>
        label={t('turnTime')}
        value={s.turnSeconds}
        options={TURN_CHOICES.map((n) => ({ value: n, label: t('secondsShort', { n }) }))}
        onChange={(v) => set({ turnSeconds: v })}
      />
      <Segmented
        label={t('throwIn')}
        value={s.neighborsOnly}
        options={[
          { value: false, label: t('all') },
          { value: true, label: t('neighborsOnly') },
        ]}
        onChange={(v) => set({ neighborsOnly: v })}
      />
      <Segmented
        label={t('attackLimit')}
        value={s.unlimited}
        options={[
          { value: false, label: t('max6') },
          { value: true, label: t('unlimited') },
        ]}
        onChange={(v) => set({ unlimited: v })}
      />
      <Segmented
        label={t('hints')}
        value={s.hints}
        options={[
          { value: false, label: t('hintsOff') },
          { value: true, label: t('hintsOn') },
        ]}
        onChange={(v) => set({ hints: v })}
      />
    </div>
  );
}

const RulesIcon = () => (
  <svg viewBox="0 0 24 24" width="19" height="19" aria-hidden="true">
    <path
      d="M6 3.5h9l3.5 3.5v13.5H6zM15 3.5V7h3.5M9 11h6M9 14.5h6M9 18h4"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

/** Im Spiel: Knopf in der Kopfleiste, zeigt die Regeln aus der Lobby (nur ansehen) */
export function RulesButton({ settings }: { settings: RoomSettings }) {
  return (
    <Popover icon={<RulesIcon />} label={t('rules')} className="rules-panel">
      <h3 className="rules-title">{t('rules')}</h3>
      <RuleSummary settings={settings} />
    </Popover>
  );
}
