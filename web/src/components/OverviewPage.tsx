import { Anchor, Code, Container, List, Paper, SimpleGrid, Stack, Text, Title } from '@mantine/core';
import type { ReactNode } from 'react';
import { sdlcSvg } from '../lib/sdlc';
import { defaults, plugins, tagline } from '../data/plugins';
import { SiteShell } from './SiteShell';
import { SDLC_INTRO, StepList, half } from './Page';

const REPO = 'https://github.com/eikelandin/BenchKeeper';

function Section({ id, title, intro, children }: { id: string; title: string; intro?: string; children: ReactNode }) {
  return (
    <Container component="section" id={id} aria-labelledby={`${id}-h`} size="xl" p={0} w="100%">
      <Stack gap="md">
        <Title order={2} id={`${id}-h`} fz={{ base: 24, md: 30 }}>{title}</Title>
        {intro && <Text maw={720}>{intro}</Text>}
        {children}
      </Stack>
    </Container>
  );
}

export default function OverviewPage({ base }: { base: string }) {
  return (
    <SiteShell base={base}>
      <Stack gap={56}>
        <Stack gap="xs" maw={720}>
          <Title order={1} fz={{ base: 34, md: 44 }}>What CedarLoom is</Title>
          <Text size="lg">{tagline}</Text>
          <Text>For developers who run Claude Code in more than one repository and want the same workflow and setup in each. <Anchor href={`${base}/#install`}>Install</Anchor>, <Anchor href={`${base}/#commands`}>commands</Anchor>.</Text>
        </Stack>
        <Section id="sdlc" title="The workflow" intro={SDLC_INTRO}>
          <div className="ring-wrap" dangerouslySetInnerHTML={{ __html: sdlcSvg }} />
          <SimpleGrid cols={{ base: 1, sm: 2 }} spacing={40} verticalSpacing="xl">
            <StepList from={0} className="steps-first" />
            <StepList from={half} />
          </SimpleGrid>
        </Section>
        <Section id="brings" title="What the plugins bring">
          <SimpleGrid cols={{ base: 1, md: 2 }}>
            {plugins.map((p) => (
              <Paper key={p.id} id={p.id} withBorder p="lg" radius="lg">
                <Title order={3} fz="lg">{p.title}</Title>
                <Text size="sm" mt="xs">{p.summary}</Text>
                {p.skills.length > 0 && (
                  <List size="sm" spacing={4} mt="sm">
                    {p.skills.map((s) => <List.Item key={s.name}><Code>{s.name}</Code>: {s.text}</List.Item>)}
                  </List>
                )}
                <List size="sm" spacing={4} mt="sm">{p.notes.map((n) => <List.Item key={n}>{n}</List.Item>)}</List>
                <Text size="sm" mt="sm">Source: <Anchor href={`${REPO}/tree/main/plugins/${p.id}`} size="sm">plugins/{p.id}</Anchor></Text>
              </Paper>
            ))}
          </SimpleGrid>
        </Section>
        <Section id="defaults" title="Defaults">
          <SimpleGrid cols={{ base: 1, md: 2 }}>
            {defaults.map((d) => (
              <Paper key={d.title} withBorder p="lg" radius="lg">
                <Title order={3} fz="lg">{d.title}</Title>
                <Text size="sm" mt="xs">{d.text}</Text>
              </Paper>
            ))}
          </SimpleGrid>
        </Section>
      </Stack>
    </SiteShell>
  );
}
