import { Anchor, List, Stack, Text, Title } from '@mantine/core';
import { planned } from '../data/plugins';
import { SiteShell } from './SiteShell';

export default function AppPage({ base }: { base: string }) {
  return (
    <SiteShell base={base}>
      <Stack gap="md" maw={760}>
        <Title order={1} fz={{ base: 34, md: 44 }}>Coming in 0.2</Title>
        <Text size="lg">{planned.summary}</Text>
        <List spacing="xs">{planned.items.map((t) => <List.Item key={t}>{t}</List.Item>)}</List>
        <Text>Version 0.1 is the plugins alone: <Anchor href={`${base}/#install`}>install them</Anchor> from the marketplace.</Text>
      </Stack>
    </SiteShell>
  );
}
