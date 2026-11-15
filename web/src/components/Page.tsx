import {
  ActionIcon, Anchor, Badge, Box, Button, Card, Code, Container, Group, List,
  SimpleGrid, Stack, Table, Text, ThemeIcon, Timeline, Title, VisuallyHidden,
} from '@mantine/core';
import { IconCheck, IconCopy, IconListCheck, IconRoute, IconSettings, IconStack2, IconTerminal2 } from '@tabler/icons-react';
import type { ReactNode } from 'react';
import { SLUG } from '../lib/repo-facts';
import { sdlcSvg } from '../lib/sdlc';
import facts from '../data/facts.json';
import { commands, install, installOne, plugins, planned, requirements } from '../data/plugins';
import Mark from './Mark';
import { SiteShell } from './SiteShell';

const PLUGIN_ICONS: Record<string, ReactNode> = {
  'cl-workflow': <IconListCheck size={20} />, 'cl-setup': <IconSettings size={20} />, 'cl-orchestration': <IconRoute size={20} />, 'cl-orca': <IconTerminal2 size={20} />, cedarloom: <IconStack2 size={20} />,
};
// Backticks in facts.json become inline code and `[label](url)` a link.
export const md = (t: string) => t.split(/(`[^`]*`|\[[^[\]]+\]\((?:[^()\s]|\([^()\s]*\))+\))/).map((part, i) => {
  if (part.startsWith('`')) return <Code key={i}>{part.slice(1, -1)}</Code>;
  const link = /^\[([^[\]]+)\]\(((?:[^()\s]|\([^()\s]*\))+)\)$/.exec(part);
  return link ? <Anchor key={i} href={link[2]}>{link[1]}</Anchor> : part;
});

function Section({ id, title, intro, children }: { id: string; title: string; intro?: ReactNode; children: ReactNode }) {
  return (
    <Box component="section" id={id} className="band" py={{ base: 56, md: 80 }}>
      <Container size="lg">
        <Stack gap="xs" maw={720} mb={40}>
          <Title order={2} fz={{ base: 28, md: 36 }}>{title}</Title>
          {intro && <Text c="dimmed" size="lg">{intro}</Text>}
        </Stack>
        {children}
      </Container>
    </Box>
  );
}

function Part({ icon, title, href, scope, children }: { icon: ReactNode; title: ReactNode; href?: string; scope: string; children: ReactNode }) {
  return (
    <Card withBorder padding="lg">
      <Group gap="sm" wrap="nowrap">
        <ThemeIcon variant="light" size={38}>{icon}</ThemeIcon>
        {href ? <Anchor href={href} fw={700} underline="hover">{title}</Anchor> : <Text fw={700}>{title}</Text>}
      </Group>
      <Text size="xs" fw={700} tt="uppercase" c="dimmed" mt="md">{scope}</Text>
      <Text size="sm" mt={6}>{children}</Text>
    </Card>
  );
}

const phaseColor = Object.fromEntries(facts.sdlc.phases.map((p) => [p.key, p.color]));
export const half = Math.ceil(facts.sdlc.steps.length / 2);

export const SDLC_INTRO = 'The workflow skill sorts each task into a software change, a docs pass or research, and gives each task a depth: how much process it gets. Quick: build, verify, ship. Deep: spec, tickets, a test only where it fails without the change, review. Several tasks on one branch run their long checks and reviews once at the end. A skill that matches the task loads at any depth, and each change type adds its own check.';

export function StepList({ from, className }: { from: number; className?: string }) {
  return (
    <Timeline active={facts.sdlc.steps.length} bulletSize={30} lineWidth={2} className={className}>
      {facts.sdlc.steps.slice(from, from + half).map((st, i) => (
        <Timeline.Item key={st.name} id={`step-${from + i + 1}`} color={phaseColor[st.phase]} bullet={<Text size="xs" fw={700}>{from + i + 1}</Text>}
          title={<Group gap="xs"><Text fw={700}>{st.name}</Text>{st.human && <Badge size="xs" variant="outline" className="decide">human in the loop</Badge>}</Group>}>
          <Text size="sm" c="dimmed">{md(from + i === 0 ? `${st.text} ${facts.sdlc.requirements}` : st.text)}</Text>
        </Timeline.Item>
      ))}
    </Timeline>
  );
}

function CmdRow({ cmd, note }: { cmd: string; note: ReactNode }) {
  return (
    <Stack gap={6}>
      <Group gap={6} wrap="nowrap">
        <Code block className="cmd">{cmd}</Code>
        <ActionIcon variant="default" size={36} data-copy={cmd} aria-label={`Copy command: ${cmd}`}>
          <IconCopy size={16} className="i-copy" /><IconCheck size={16} className="i-done" />
        </ActionIcon>
      </Group>
      <Text size="sm" c="dimmed">{note}</Text>
    </Stack>
  );
}

export default function Page({ base, updated, commit }: { base: string; updated?: string; commit?: string }) {
  return (
    <SiteShell base={base} home updated={updated} commit={commit}>
        <Box className="hero" py={{ base: 64, md: 112 }}>
          <Container size="lg">
            <SimpleGrid cols={{ base: 1, md: 2 }} spacing={48} style={{ alignItems: 'center' }}>
              <Stack gap="lg">
                <Badge variant="light" size="lg">Plugins for Claude Code</Badge>
                <Title order={1} fz={{ base: 44, md: 68 }} lh={1.02}><span className="grad">CedarLoom</span></Title>
                <Text size="xl" maw={560}>
                  A workflow that sizes each task and runs the checks and reviews it needs, skills that set up and maintain your repositories, and a coordinator for the issues of several projects.
                </Text>
                <Text c="dimmed" maw={560}>
                  Install them from the CedarLoom marketplace, together as the <code>cedarloom</code> bundle or one by one.
                </Text>
                <Group mt="sm">
                  <Button component="a" href="#install" size="md">Install the plugins</Button>
                  <Button component="a" href="#sdlc" size="md" variant="default">See the workflow</Button>
                  <Button component="a" href={`${base}/overview/`} size="md" variant="default">What it brings</Button>
                </Group>
              </Stack>
              <Box ta="center">
                <Mark base={base} size={300} alt="CedarLoom logo: a workflow graph shaped like a cedar" style={{ width: 'min(300px, 64vw)' }} />
              </Box>
            </SimpleGrid>
          </Container>
        </Box>

        <Section id="sdlc" title="One loop, sized to the change" intro={SDLC_INTRO}>
          <div className="ring-wrap">
            <div dangerouslySetInnerHTML={{ __html: sdlcSvg }} />
            <div className="ring-tip" role="tooltip" hidden></div>
          </div>
          <SimpleGrid cols={{ base: 1, sm: 2 }} spacing={40} verticalSpacing="xl" mt={40}>
            <StepList from={0} className="steps-first" />
            <StepList from={half} />
          </SimpleGrid>
        </Section>

        <Section id="plugins" title="Four plugins and a bundle">
          <SimpleGrid cols={{ base: 1, sm: 2 }}>
            {plugins.map((p) => (
              <Part key={p.id} icon={PLUGIN_ICONS[p.id]} title={p.title} href={`${base}/overview/#${p.id}`} scope={p.id === 'cedarloom' ? 'Bundle' : p.skills.length === 0 ? 'Plugin' : `Plugin, ${p.skills.length} ${p.skills.length === 1 ? 'skill' : 'skills'}`}>{p.summary}</Part>
            ))}
          </SimpleGrid>
        </Section>

        <Section id="install" title="Install" intro="From the CedarLoom marketplace, in a terminal.">
          <Stack gap="lg" maw={760}>
            {install.map((st) => <CmdRow key={st.command} cmd={st.command} note={st.text} />)}
            <CmdRow cmd={installOne} note="Installs a single plugin instead of the bundle; cl-orchestration brings cl-workflow with it, and cl-orca brings both." />
            <Text size="sm">You need:</Text>
            <List size="sm" spacing={4}>
              {requirements.map(([name, why]) => <List.Item key={name}><Text span fw={700}>{name}:</Text> {why}.</List.Item>)}
            </List>
            <Text size="sm">Codex reads the same marketplace: its install commands are in the <Anchor href={`https://github.com/${SLUG}#install`}>README</Anchor>.</Text>
            <VisuallyHidden aria-live="polite" data-copy-status></VisuallyHidden>
          </Stack>
        </Section>

        <Section id="commands" title="Commands" intro="Each skill is a slash command. Only workflow also loads by itself, before the first edit in a repository.">
          <Table.ScrollContainer minWidth={0}>
            <Table withTableBorder withColumnBorders verticalSpacing="sm" style={{ tableLayout: 'fixed' }}>
              <Table.Thead>
                <Table.Tr><Table.Th scope="col" w="38%">Command</Table.Th><Table.Th scope="col">What it does</Table.Th></Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {commands.map((c) => (
                  <Table.Tr key={c.command}>
                    <Table.Th scope="row" style={{ overflowWrap: 'anywhere' }}><Code>{c.command}</Code>{c.args && <Text size="xs" c="dimmed" mt={4}>{c.args}</Text>}</Table.Th>
                    <Table.Td>{c.text}</Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        </Section>

        <Section id="planned" title="Coming in 0.2">
          <Stack gap="md" maw={760}>
            <Text>{planned.summary}</Text>
            <Anchor href={`${base}/app/`}>More about 0.2</Anchor>
          </Stack>
        </Section>
    </SiteShell>
  );
}
