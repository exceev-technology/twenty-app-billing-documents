import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { closeSidePanel, enqueueSnackbar, useColorScheme, useLocale, useSelectedRecordIds } from 'twenty-sdk/front-component';
import { RestApiClient } from 'twenty-client-sdk/rest';
import { localDateOf } from './action-feedback.ts';
import { formWords, inputValue, postEmail, readPrepared, readSent, withField, type EditableField, type EmailForm, type EmailObject } from './email-form.ts';

/** Twenty's own components cannot be imported here: plain elements, in colours close to Twenty's light and dark themes. */
const PALETTE = {
  light: { text: '#333333', muted: '#818181', border: '#d6d6d6', field: '#ffffff', accent: '#3e63dd', onAccent: '#ffffff', danger: '#d92d20' },
  dark: { text: '#ebebeb', muted: '#999999', border: '#3b3b3b', field: '#1b1b1b', accent: '#5c7ce6', onAccent: '#ffffff', danger: '#f97066' },
} as const;

type Colors = (typeof PALETTE)[keyof typeof PALETTE];

function stylesFor(colors: Colors): Record<string, CSSProperties> {
  const field: CSSProperties = {
    font: 'inherit', fontSize: 13, color: colors.text, background: colors.field, border: `1px solid ${colors.border}`, borderRadius: 4,
    padding: '6px 8px', width: '100%', boxSizing: 'border-box',
  };
  const button: CSSProperties = { font: 'inherit', fontSize: 13, borderRadius: 4, padding: '6px 12px', cursor: 'pointer' };
  return {
    panel: { display: 'flex', flexDirection: 'column', gap: 12, padding: 16, color: colors.text, fontSize: 13 },
    heading: { margin: 0, fontSize: 15, fontWeight: 600 },
    label: { display: 'flex', flexDirection: 'column', gap: 4, color: colors.muted },
    field,
    area: { ...field, resize: 'vertical', lineHeight: 1.5 },
    value: { color: colors.text },
    muted: { margin: 0, color: colors.muted },
    problems: { display: 'flex', flexDirection: 'column', gap: 4 },
    problem: { margin: 0, color: colors.danger },
    actions: { display: 'flex', justifyContent: 'flex-end', gap: 8 },
    secondary: { ...button, color: colors.text, background: 'transparent', border: `1px solid ${colors.border}` },
    primary: { ...button, color: colors.onAccent, background: colors.accent, border: `1px solid ${colors.accent}` },
    disabled: { ...button, color: colors.onAccent, background: colors.accent, border: `1px solid ${colors.accent}`, opacity: 0.5, cursor: 'default' },
  };
}

type Props = { object: EmailObject };

/**
 * Send by email (email spec §8), in the side panel, for the one selected document:
 * Prepare fills the form, the person reviews it, Send posts it with their own token.
 * The route words every problem; the transport failures use the buttons' own words.
 */
export function SendEmailForm({ object }: Props) {
  const [recordId] = useSelectedRecordIds();
  const locale = useLocale();
  const styles = stylesFor(PALETTE[useColorScheme()]);
  const words = formWords(locale);
  const [form, setForm] = useState<EmailForm | null>(null);
  const [problems, setProblems] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  // Set before the first await: a second click lands before React has re-rendered the disabled button.
  const state = useRef<'idle' | 'sending' | 'sent'>('idle');

  useEffect(() => {
    if (!recordId) return;
    let current = true;
    const client = new RestApiClient();
    void postEmail((path, body) => client.post(path, body), { step: 'prepare', object, recordId, localDate: localDateOf(new Date()), locale }).then((answer) => {
      if (!current) return;
      const read = readPrepared(answer, locale);
      if (read.ok) setForm(read.form);
      else setProblems(read.problems);
    });
    return () => {
      current = false;
    };
  }, [object, recordId, locale]);

  const edit = (field: EditableField) => (event: unknown) => {
    const value = inputValue(event);
    setForm((previous) => (previous ? withField(previous, field, value) : previous));
  };

  const close = () => {
    void closeSidePanel();
  };

  const send = async (): Promise<void> => {
    if (!form || !recordId || state.current !== 'idle') return;
    state.current = 'sending';
    setBusy(true);
    setProblems([]);
    const client = new RestApiClient();
    const answer = await postEmail((path, body) => client.post(path, body), {
      step: 'send', object, recordId, localDate: localDateOf(new Date()), locale,
      from: form.from, to: form.to, cc: form.cc, subject: form.subject, message: form.message,
    });
    const read = readSent(answer, locale);
    if (!read.ok) {
      setProblems(read.problems);
      state.current = 'idle';
      setBusy(false);
      return;
    }
    // Sent: Send stays disabled, even if the panel does not close, so a second click cannot send it twice.
    state.current = 'sent';
    try {
      await enqueueSnackbar({ message: read.message, variant: read.variant });
      await closeSidePanel();
    } catch (error) {
      console.error('billing email: the snackbar or the side panel failed after the send', error);
    }
  };

  const problemList =
    problems.length > 0 ? (
      <div style={styles.problems}>
        {problems.map((problem, index) => (
          <p key={index} style={styles.problem}>
            {problem}
          </p>
        ))}
      </div>
    ) : null;

  if (!form) {
    return (
      <div style={styles.panel}>
        {problemList ?? <p style={styles.muted}>{words.loading}</p>}
        {problemList ? (
          <div style={styles.actions}>
            <button type="button" style={styles.secondary} onClick={close}>
              {words.cancel}
            </button>
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div style={styles.panel}>
      <p style={styles.heading}>{words.heading(object, form.number)}</p>
      <label style={styles.label}>
        {words.from}
        {form.mailboxes.length > 1 ? (
          <select style={styles.field} value={form.from} onChange={edit('from')}>
            {form.mailboxes.map((mailbox) => (
              <option key={mailbox.id} value={mailbox.id}>
                {mailbox.handle}
              </option>
            ))}
          </select>
        ) : (
          <span style={styles.value}>{form.mailboxes[0]?.handle ?? ''}</span>
        )}
      </label>
      <label style={styles.label}>
        {words.to}
        <input style={styles.field} type="text" value={form.to} onChange={edit('to')} />
      </label>
      <label style={styles.label}>
        {words.cc}
        <input style={styles.field} type="text" value={form.cc} onChange={edit('cc')} />
      </label>
      <p style={styles.muted}>{words.separate}</p>
      <label style={styles.label}>
        {words.subject}
        <input style={styles.field} type="text" value={form.subject} onChange={edit('subject')} />
      </label>
      <label style={styles.label}>
        {words.message}
        <textarea style={styles.area} rows={12} value={form.message} onChange={edit('message')} />
      </label>
      <p style={styles.muted}>{words.attachmentLine(form.attachment)}</p>
      {problemList}
      <div style={styles.actions}>
        <button type="button" style={styles.secondary} onClick={close}>
          {words.cancel}
        </button>
        <button type="button" style={busy ? styles.disabled : styles.primary} disabled={busy} onClick={() => void send()}>
          {busy ? words.sending : words.send}
        </button>
      </div>
    </div>
  );
}
