import { Code, Stack, Table, Text, Title } from '@mantine/core';
import { hooks } from '../data/plugins';
import { SiteShell } from './SiteShell';

export default function WritesPage({ base }: { base: string }) {
  return (
    <SiteShell base={base}>
      <Stack gap="md" maw={960}>
        <Title order={1} fz={{ base: 34, md: 44 }}>What the plugins write and run</Title>
        <Text>The skills start only when you call them, apart from workflow, which loads by itself. These hooks run on their own, with node.</Text>
        <Table.ScrollContainer minWidth={0}>
          <Table withTableBorder withColumnBorders verticalSpacing="sm" style={{ tableLayout: 'fixed' }}>
            <Table.Thead>
              <Table.Tr><Table.Th scope="col" w="22%">Hook</Table.Th><Table.Th scope="col" w="28%">When it runs</Table.Th><Table.Th scope="col">What it does</Table.Th></Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {hooks.map((h) => (
                <Table.Tr key={h.name}>
                  <Table.Th scope="row" style={{ overflowWrap: 'anywhere' }}>{h.name}<Text size="xs" c="dimmed" mt={4}><Code>{h.plugin}</Code></Text></Table.Th>
                  <Table.Td>{h.when}</Table.Td>
                  <Table.Td style={{ overflowWrap: 'anywhere' }}>{h.does}</Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      </Stack>
    </SiteShell>
  );
}
