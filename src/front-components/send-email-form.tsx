import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { closeSidePanel, enqueueSnackbar, useColorScheme, useLocale, useSelectedRecordIds } from 'twenty-sdk/front-component';
import { RestApiClient } from 'twenty-client-sdk/rest';
import { localDateOf } from './action-feedback.ts';
import {
  SEND_START, SENDS_IN_FLIGHT, canSend, claimSend, formWords, inputValue, postEmail, readPrepared, readSent, releaseSend, sendKey, sendStep, staleNotice, withField,
  type EditableField, type EmailForm, type EmailObject, type SendEvent, type SendState, type SentRead,
} from './email-form.ts';

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
    notice: { margin: 0, color: colors.text },
    secondary: { ...button, color: colors.text, background: 'transparent', border: `1px solid ${colors.border}` },
    secondaryDisabled: { ...button, color: colors.text, background: 'transparent', border: `1px solid ${colors.border}`, opacity: 0.5, cursor: 'default' },
    primary: { ...button, color: colors.onAccent, background: colors.accent, border: `1px solid ${colors.accent}` },
    disabled: { ...button, color: colors.onAccent, background: colors.accent, border: `1px solid ${colors.accent}`, opacity: 0.5, cursor: 'default' },
  };
}

type Props = { object: EmailObject };

/**
 * One call, one client: Twenty's clients are built inside each run, never at module scope. Built here, inside
 * the call postTo guards, so a client that cannot be built is an answer like any other and never a throw that
 * would leave the form sending.
 */
const post = (path: string, body: unknown): Promise<unknown> => new RestApiClient().post(path, body);

/**
 * Send by email (email spec §8), in the side panel, for the one selected document:
 * Prepare fills the form, the person reviews it, Send posts it with their own token.
 * The route words every problem; the transport failures use the buttons' own words.
 *
 * The form belongs to one record. The selection may move under a mounted panel, so nothing of a
 * form survives a change of record, and an answer, Prepare's or Send's, counts only for the record
 * it was asked for (sendStep). The selection and the form's latest text are read from refs: a click
 * can land before React has re-rendered, and a change event may only fire on blur.
 */
export function SendEmailForm({ object }: Props) {
  const recordId: string | null = useSelectedRecordIds()[0] ?? null;
  const locale = useLocale();
  const styles = stylesFor(PALETTE[useColorScheme()]);
  const words = formWords(locale);
  const [prepared, setPrepared] = useState<EmailForm | null>(null);
  const [problems, setProblems] = useState<string[]>([]);
  // The success message, shown in the form when the snackbar could not be.
  const [confirmation, setConfirmation] = useState<string | null>(null);
  const [send, setSend] = useState<SendState>(SEND_START);
  // The machine is read before the first await, from the ref: the state above only paints it.
  const machine = useRef<SendState>(SEND_START);
  // The form as the person last left it, updated by `edit` before it returns: Send reads this, not a render's closure.
  const latest = useRef<EmailForm | null>(null);

  /** Moves the machine; false when it dropped the event (another record's answer, a second Send, a locked form). */
  const step = (event: SendEvent): boolean => {
    const next = sendStep(machine.current, event);
    if (next === machine.current) return false;
    machine.current = next;
    setSend(next);
    return true;
  };

  // A panel closed mid-send shows no record any more: its answer is then told by snackbar alone, as a moved selection's is.
  useEffect(
    () => () => {
      machine.current = SEND_START;
    },
    [],
  );

  useEffect(() => {
    // A new record starts from nothing: the previous form's To, subject and message must never ride on another record's id.
    latest.current = null;
    setPrepared(null);
    setProblems([]);
    setConfirmation(null);
    step({ type: 'select', record: recordId });
    if (!recordId) return;
    let current = true;
    void postEmail(post, { step: 'prepare', object, recordId, localDate: localDateOf(new Date()), locale }).then((answer) => {
      if (!current) return;
      const read = readPrepared(answer, locale);
      if (!read.ok) {
        setProblems(read.problems);
        return;
      }
      if (!step({ type: 'loaded', record: recordId })) return;
      latest.current = read.form;
      setPrepared(read.form);
    });
    return () => {
      current = false;
    };
  }, [object, recordId, locale]);

  const edit = (field: EditableField) => (event: unknown) => {
    const previous = latest.current;
    if (!previous) return;
    const next = withField(previous, field, inputValue(event));
    latest.current = next;
    setPrepared(next);
  };

  const close = () => {
    void closeSidePanel();
  };

  const submit = async (): Promise<void> => {
    const toSend = latest.current;
    if (!toSend || !recordId) return;
    // Two guards, both settled before the first await. The document's own: no second Send in parallel with one in
    // flight, even from a fresh form (A, B, A). The form's: one Send, from a loaded form of the selected record.
    const key = sendKey(object, recordId);
    if (!claimSend(SENDS_IN_FLIGHT, key)) return;
    if (!step({ type: 'send', record: recordId })) {
      releaseSend(SENDS_IN_FLIGHT, key);
      return;
    }
    setProblems([]);
    let read: SentRead;
    try {
      read = readSent(
        await postEmail(post, {
          step: 'send', object, recordId, localDate: localDateOf(new Date()), locale,
          from: toSend.from, to: toSend.to, cc: toSend.cc, subject: toSend.subject, message: toSend.message,
        }),
        locale,
      );
    } finally {
      // Whatever came back, and whoever is looking at it now.
      releaseSend(SENDS_IN_FLIGHT, key);
    }
    if (!step({ type: 'answer', record: recordId, read })) {
      // The selection moved, or the panel closed, while this was in flight: the form on screen (if any) is another
      // record's, and not this answer's to touch. The person still hears what became of the email they sent.
      const notice = staleNotice(read, locale);
      if (notice) {
        try {
          await enqueueSnackbar(notice);
        } catch (error) {
          console.error('billing email: the snackbar failed after a send whose form had been left', error);
        }
      }
      return;
    }
    if (!read.ok) {
      // Refused or never reached: the person may correct and try again. Unconfirmed: the email may have gone, and the form stays locked.
      setProblems(read.problems);
      return;
    }
    // Sent: the form stays locked whatever happens next, so a second click cannot send it twice. The snackbar and
    // the panel are told apart: a snackbar that fails leaves the message in the form; a panel that stays open leaves the form.
    try {
      await enqueueSnackbar({ message: read.message, variant: read.variant });
    } catch (error) {
      console.error('billing email: the snackbar failed after the send', error);
      setConfirmation(read.message);
    }
    try {
      await closeSidePanel();
    } catch (error) {
      console.error('billing email: the side panel did not close after the send', error);
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

  // The form on screen is the selected record's, or none: for the render that sees a new selection before the effect clears the old form.
  const form = send.record === recordId ? prepared : null;
  const sending = send.phase === 'sending';

  if (!form) {
    return (
      <div style={styles.panel}>
        {recordId ? (problemList ?? <p style={styles.muted}>{words.loading}</p>) : <p style={styles.muted}>{words.noRecord}</p>}
        <div style={styles.actions}>
          <button type="button" style={styles.secondary} onClick={close}>
            {words.cancel}
          </button>
        </div>
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
      {confirmation ? <p style={styles.notice}>{confirmation}</p> : null}
      {problemList}
      <div style={styles.actions}>
        {/* Closing mid-send would lose the answer, and invite a reopen and a second send. */}
        <button type="button" style={sending ? styles.secondaryDisabled : styles.secondary} disabled={sending} onClick={close}>
          {words.cancel}
        </button>
        <button type="button" style={canSend(send) ? styles.primary : styles.disabled} disabled={!canSend(send)} onClick={() => void submit()}>
          {sending ? words.sending : words.send}
        </button>
      </div>
    </div>
  );
}
