import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import { getApiErrorMessage } from '../../src/api/errors';
import { fetchTerminal, killTerminalSession, SESSION_NAME_RE } from '../../src/api/terminal';
import { Badge } from '../../src/components/ui/Badge';
import { Button } from '../../src/components/ui/Button';
import { Card, Divider } from '../../src/components/ui/Card';
import { Input } from '../../src/components/ui/Input';
import { Screen } from '../../src/components/ui/Screen';
import { color, radius, space, type } from '../../src/theme';
import type { TerminalSession, TerminalState } from '../../src/types/api';

const ACCESS_CMD = 'py -3.14 -m agent.scripts.terminal_access';

function ago(unixSecs: number): string {
  const secs = Math.max(0, Date.now() / 1000 - unixSecs);
  if (secs < 60) return 'just now';
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`;
  return `${Math.floor(secs / 86400)}d ago`;
}

/** A command to type on the laptop, set apart so it reads as copyable. */
function Command({ children }: { children: string }) {
  return (
    <Text style={styles.command} selectable>
      {children}
    </Text>
  );
}

/**
 * Shown until the laptop has switched the terminal on and allowed this phone.
 *
 * There's deliberately no button here to do either: a shell is the one thing
 * a stolen phone must not be able to grant itself, so access is only ever
 * changed at the laptop.
 */
function AccessCard({ state }: { state: TerminalState }) {
  const shortId = state.device_id.slice(0, 8);
  return (
    <Card label="Remote terminal" labelRight={state.enabled ? 'On' : 'Off'}>
      <Text style={styles.body}>
        A shell on your laptop, inside WSL. Sessions live in tmux, so they keep running when you
        close the app, and you can pick them up at the desk too.
      </Text>
      <Divider />
      <Text style={styles.hint}>
        {state.enabled
          ? "It's on, but this phone isn't allowed yet. On the laptop, from the Tether folder, run:"
          : "It's off. Access is granted on the laptop, never from the phone. From the Tether folder, run:"}
      </Text>
      {state.enabled ? null : <Command>{`${ACCESS_CMD} enable`}</Command>}
      <Command>{`${ACCESS_CMD} allow ${shortId}`}</Command>
      <Text style={styles.hint}>
        {shortId} is the start of this phone&apos;s device id. Pull down to refresh afterwards.
      </Text>
    </Card>
  );
}

function SessionRow({
  session,
  ending,
  onOpen,
  onEnd,
}: {
  session: TerminalSession;
  ending: boolean;
  onOpen: () => void;
  onEnd: () => void;
}) {
  const windows = `${session.windows} window${session.windows === 1 ? '' : 's'}`;
  return (
    <View style={styles.sessionRow}>
      <View style={styles.sessionInfo}>
        <Text style={styles.sessionName} numberOfLines={1}>
          {session.name}
        </Text>
        <Text style={styles.hint}>
          {windows} · active {ago(session.activity)}
        </Text>
      </View>
      {session.attached > 0 ? <Badge label="Attached" tone="live" /> : null}
      <Button label="Open" compact onPress={onOpen} />
      <Button label="End" variant="danger" compact busy={ending} onPress={onEnd} />
    </View>
  );
}

export default function TerminalScreen() {
  const queryClient = useQueryClient();
  const { data, isLoading, isError, error, refetch, isRefetching } = useQuery({
    queryKey: ['terminal'],
    queryFn: fetchTerminal,
    refetchInterval: 10_000,
  });
  const [newName, setNewName] = useState('tether');
  const [ending, setEnding] = useState<string | null>(null);

  const nameError = newName && !SESSION_NAME_RE.test(newName)
    ? 'Letters, numbers, - and _ only (up to 32)'
    : null;

  const open = (name: string) => router.push({ pathname: '/session/[name]', params: { name } });

  const end = (name: string) => {
    Alert.alert('End session', `End "${name}" and everything running in it?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'End session',
        style: 'destructive',
        onPress: async () => {
          setEnding(name);
          try {
            await killTerminalSession(name);
          } catch (err) {
            Alert.alert("Couldn't end session", getApiErrorMessage(err));
          } finally {
            setEnding(null);
            await queryClient.invalidateQueries({ queryKey: ['terminal'] });
          }
        },
      },
    ]);
  };

  const lanBlocked = data ? data.tailscale_only && !data.via_tailscale : false;

  return (
    <Screen title="Terminal" scroll={false}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={refetch}
            tintColor={color.signal}
            colors={[color.signal]}
            progressBackgroundColor={color.surface}
          />
        }
      >
        {isLoading ? (
          <Card>
            <Text style={styles.hint}>Loading…</Text>
          </Card>
        ) : isError || !data ? (
          <Card>
            <Text style={styles.body}>Couldn&apos;t reach the laptop</Text>
            <Text style={styles.hint}>{getApiErrorMessage(error)}</Text>
          </Card>
        ) : !data.allowed ? (
          <AccessCard state={data} />
        ) : lanBlocked ? (
          <Card label="Remote terminal">
            <Text style={styles.body}>Only available over Tailscale</Text>
            <Text style={styles.hint}>
              The laptop refuses terminal connections over plain Wi-Fi, where keystrokes would
              cross the network unencrypted. Switch the laptop address in Settings to its
              Tailscale IP.
            </Text>
          </Card>
        ) : (
          <>
            <Card label="Sessions" labelRight={data.sessions.length ? String(data.sessions.length) : undefined}>
              {data.error ? (
                <>
                  <Text style={styles.warning}>Couldn&apos;t list sessions: {data.error}</Text>
                  <Text style={styles.hint}>Check that WSL is installed and has tmux.</Text>
                </>
              ) : data.sessions.length === 0 ? (
                <Text style={styles.hint}>No sessions running. Start one below.</Text>
              ) : (
                data.sessions.map((s, i) => (
                  <View key={s.name}>
                    {i > 0 ? <Divider /> : null}
                    <SessionRow
                      session={s}
                      ending={ending === s.name}
                      onOpen={() => open(s.name)}
                      onEnd={() => end(s.name)}
                    />
                  </View>
                ))
              )}
            </Card>

            <Card label="New session">
              <Input
                label="Name"
                value={newName}
                onChangeText={setNewName}
                autoCapitalize="none"
                autoCorrect={false}
                error={nameError}
                hint="Opens it if it's already running."
              />
              <Button
                label="Open"
                disabled={!newName || !!nameError}
                onPress={() => open(newName)}
              />
            </Card>

            <Text style={styles.footnote}>
              Same session at the laptop: run{' '}
              <Text style={styles.inlineCode}>tmux attach -t {data.sessions[0]?.name ?? 'tether'}</Text> in
              WSL. The phone is dropped after 15 minutes without typing; the session keeps running.
            </Text>
          </>
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: space.md, paddingBottom: space.lg },
  body: { ...type.body, color: color.text },
  hint: type.caption,
  warning: { ...type.caption, color: color.danger },
  command: {
    fontFamily: 'monospace',
    fontSize: 13,
    color: color.signal,
    backgroundColor: color.surfaceRaised,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: color.line,
    paddingHorizontal: space.sm,
    paddingVertical: space.sm,
  },
  sessionRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  sessionInfo: { flex: 1, gap: 2 },
  sessionName: { ...type.body, color: color.text, fontWeight: '700' },
  footnote: { ...type.caption, paddingHorizontal: space.xs },
  inlineCode: { fontFamily: 'monospace', color: color.textDim },
});
