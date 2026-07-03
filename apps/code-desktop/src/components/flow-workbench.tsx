import type {
  TargetFlow,
  TargetFlowCoverageEvidence,
  TargetFlowCoverageSummary,
  TargetFlowEdge,
  TargetFlowNode,
} from '@workspace/code-agent-contracts/sessions';
import { Canvas, CanvasPanel } from '@workspace/ui/components/ai-elements/canvas';
import { Edge as WorkflowEdge } from '@workspace/ui/components/ai-elements/edge';
import {
  Node,
  NodeContent,
  NodeDescription,
  NodeFooter,
  NodeHeader,
  NodeTitle,
} from '@workspace/ui/components/ai-elements/node';
import { Badge } from '@workspace/ui/components/ui/badge';
import { Button } from '@workspace/ui/components/ui/button';
import { cn } from '@workspace/ui/lib/utils';
import { FileText, FolderOpen, Image, Video } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import {
  flowToCanvas,
  flowsToCanvas,
  type FlowCanvasEdge,
  type FlowCanvasNode,
  type FlowCoverageKindStatus,
  type FlowCoverageKindSummary,
} from '#/lib/flow-workbench';

type SelectedFlowItem =
  | {
      kind: 'node';
      flow: TargetFlow;
      item: TargetFlowNode;
      evidence: TargetFlowCoverageEvidence[];
      coverageKinds: FlowCoverageKindSummary[];
    }
  | {
      kind: 'edge';
      flow: TargetFlow;
      item: TargetFlowEdge;
      evidence: TargetFlowCoverageEvidence[];
      coverageKinds: FlowCoverageKindSummary[];
    };

interface FlowWorkbenchProps {
  flows: TargetFlow[];
  empty: string;
  layout?: 'stacked' | 'unified';
  className?: string;
  canvasClassName?: string;
  onPreviewArtifact: (artifact: TargetFlowCoverageEvidence) => void;
  onRevealArtifact: (artifact: TargetFlowCoverageEvidence) => void;
}

const edgeTypes = {
  animated: WorkflowEdge.Animated,
  temporary: WorkflowEdge.Temporary,
};

const nodeTypes = {
  workflow: ({ data, selected }: { data: FlowCanvasNode['data']; selected?: boolean }) => {
    const { node } = data;
    return (
      <Node
        aria-label={node.label}
        handles={{ source: true, target: true }}
        className={cn(selected && 'border-primary shadow-none')}
      >
        <NodeHeader>
          <NodeTitle>{node.label}</NodeTitle>
          <NodeDescription>{node.route ?? node.kind}</NodeDescription>
        </NodeHeader>
        <NodeContent className='space-y-3'>
          <div className='flex flex-wrap gap-1'>
            {data.coverageKinds.map((coverage) => (
              <CoverageKindBadge key={coverage.kind} coverage={coverage} />
            ))}
          </div>
          <EvidenceStrip evidence={data.evidence} />
        </NodeContent>
        <NodeFooter className='justify-between'>
          <span>
            {node.coverage.covered}/{node.coverage.required} covered
          </span>
          <span>{data.evidence.length ? `${data.evidence.length} artifacts` : 'No artifacts'}</span>
        </NodeFooter>
      </Node>
    );
  },
};

export function FlowWorkbench({
  flows,
  empty,
  layout = 'stacked',
  className,
  canvasClassName,
  onPreviewArtifact,
  onRevealArtifact,
}: FlowWorkbenchProps) {
  const [selected, setSelected] = useState<SelectedFlowItem>();

  useEffect(() => {
    setSelected(undefined);
  }, [flows]);

  if (flows.length === 0) {
    return (
      <div
        className={cn(
          'border-y',
          layout === 'unified' ? 'flex min-h-[34rem] items-center' : '',
          className,
        )}
      >
        <p className='text-muted-foreground px-1 py-5 text-sm'>{empty}</p>
      </div>
    );
  }

  if (layout === 'unified') {
    return (
      <div className={cn('grid min-h-0 gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]', className)}>
        <UnifiedFlowCanvas
          flows={flows}
          selected={selected}
          canvasClassName={canvasClassName}
          onSelect={setSelected}
        />
        <FlowInspectorPanel
          selected={selected}
          onPreviewArtifact={onPreviewArtifact}
          onRevealArtifact={onRevealArtifact}
        />
      </div>
    );
  }

  return (
    <div className={cn('space-y-8', className)}>
      {flows.map((flow) => (
        <FlowCanvas
          key={flow.flowId}
          flow={flow}
          selected={selected}
          canvasClassName={canvasClassName}
          onSelect={setSelected}
        />
      ))}
      {selected ? (
        <FlowInspector
          selected={selected}
          onPreviewArtifact={onPreviewArtifact}
          onRevealArtifact={onRevealArtifact}
        />
      ) : null}
    </div>
  );
}

function UnifiedFlowCanvas({
  flows,
  selected,
  canvasClassName,
  onSelect,
}: {
  flows: TargetFlow[];
  selected?: SelectedFlowItem;
  canvasClassName?: string;
  onSelect: (item: SelectedFlowItem) => void;
}) {
  const graph = useMemo(() => flowsToCanvas(flows), [flows]);

  return (
    <Canvas
      className={cn('min-h-[34rem]', canvasClassName)}
      nodes={graph.nodes}
      edges={graph.edges}
      nodeTypes={nodeTypes}
      edgeTypes={edgeTypes}
      nodesDraggable={false}
      nodesConnectable={false}
      elementsSelectable
      onNodeClick={(_, node) => {
        const data = node.data as FlowCanvasNode['data'];
        onSelect({
          kind: 'node',
          flow: data.flow,
          item: data.node,
          evidence: data.evidence,
          coverageKinds: data.coverageKinds,
        });
      }}
      onEdgeClick={(_, edge) => {
        const data = edge.data as FlowCanvasEdge['data'] | undefined;
        if (!data) return;
        onSelect({
          kind: 'edge',
          flow: data.flow,
          item: data.edge,
          evidence: data.evidence,
          coverageKinds: data.coverageKinds,
        });
      }}
    >
      <CanvasPanel position='top-left'>
        {flows.length} {flows.length === 1 ? 'flow' : 'flows'}
      </CanvasPanel>
      {selected ? <CanvasPanel position='top-right'>{selected.item.label}</CanvasPanel> : null}
    </Canvas>
  );
}

function FlowCanvas({
  flow,
  selected,
  canvasClassName,
  onSelect,
}: {
  flow: TargetFlow;
  selected?: SelectedFlowItem;
  canvasClassName?: string;
  onSelect: (item: SelectedFlowItem) => void;
}) {
  const graph = useMemo(() => flowToCanvas(flow), [flow]);

  return (
    <section className='space-y-4'>
      <div className='flex items-start justify-between gap-3'>
        <div className='min-w-0'>
          <h3 className='truncate font-medium'>{flow.name}</h3>
          <p className='text-muted-foreground truncate text-sm'>{flow.goal || flow.relativePath}</p>
        </div>
        <Badge variant={flow.graph.issues.length ? 'secondary' : 'outline'}>
          {flow.coverageScenarios.length} scenarios
        </Badge>
      </div>
      <Canvas
        className={canvasClassName}
        nodes={graph.nodes}
        edges={graph.edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable
        onNodeClick={(_, node) => {
          const data = node.data as FlowCanvasNode['data'];
          onSelect({
            kind: 'node',
            flow: data.flow,
            item: data.node,
            evidence: data.evidence,
            coverageKinds: data.coverageKinds,
          });
        }}
        onEdgeClick={(_, edge) => {
          const data = edge.data as FlowCanvasEdge['data'] | undefined;
          if (!data) return;
          onSelect({
            kind: 'edge',
            flow: data.flow,
            item: data.edge,
            evidence: data.evidence,
            coverageKinds: data.coverageKinds,
          });
        }}
      >
        <CanvasPanel position='top-left'>
          {selected?.flow.flowId === flow.flowId ? selected.item.label : flow.name}
        </CanvasPanel>
      </Canvas>
    </section>
  );
}

function FlowInspectorPanel({
  selected,
  onPreviewArtifact,
  onRevealArtifact,
}: {
  selected?: SelectedFlowItem;
  onPreviewArtifact: (artifact: TargetFlowCoverageEvidence) => void;
  onRevealArtifact: (artifact: TargetFlowCoverageEvidence) => void;
}) {
  if (!selected) {
    return (
      <aside className='border-y py-4'>
        <p className='text-muted-foreground text-sm'>Select a step to inspect coverage.</p>
      </aside>
    );
  }

  return (
    <aside className='min-h-0 overflow-auto border-y py-4'>
      <FlowInspector
        selected={selected}
        onPreviewArtifact={onPreviewArtifact}
        onRevealArtifact={onRevealArtifact}
      />
    </aside>
  );
}

function FlowInspector({
  selected,
  onPreviewArtifact,
  onRevealArtifact,
}: {
  selected: SelectedFlowItem;
  onPreviewArtifact: (artifact: TargetFlowCoverageEvidence) => void;
  onRevealArtifact: (artifact: TargetFlowCoverageEvidence) => void;
}) {
  const summary = selected.item.coverage;
  const scenarioIds = new Set(summary.scenarios.map((scenario) => scenario.scenarioId));
  const scenarios = selected.flow.coverageScenarios.filter((scenario) =>
    scenarioIds.has(scenario.scenarioId),
  );
  const title = selected.item.label;

  return (
    <section className='space-y-4'>
      <div>
        <h3 className='font-medium'>{title}</h3>
        <p className='text-muted-foreground text-sm'>
          {selected.kind === 'node'
            ? `State ${selected.item.stateId}`
            : `Transition ${selected.item.transitionId}`}
        </p>
      </div>

      <div className='space-y-2'>
        {selected.coverageKinds.map((coverage) => (
          <div
            key={coverage.kind}
            className='flex items-center justify-between gap-3 border-y py-2 text-sm'
          >
            <span>{coverage.label}</span>
            <span className='flex items-center gap-2'>
              {coverage.evidenceCount ? (
                <span className='text-muted-foreground text-xs'>
                  {coverage.evidenceCount} artifacts
                </span>
              ) : null}
              <CoverageKindBadge coverage={coverage} />
            </span>
          </div>
        ))}
      </div>

      <div className='divide-y border-y'>
        <div className='flex items-center justify-between gap-3 py-3'>
          <span className='text-sm'>Required coverage</span>
          <span className='flex items-center gap-2'>
            <span className='text-muted-foreground text-xs'>
              {summary.covered}/{summary.required}
            </span>
            <CoverageBadge status={summary.status} />
          </span>
        </div>
        {summary.scenarios.map((scenario) => (
          <div key={scenario.scenarioId} className='py-3'>
            <div className='flex items-start justify-between gap-3'>
              <span className='min-w-0'>
                <span className='block truncate text-sm font-medium'>{scenario.title}</span>
                <span className='text-muted-foreground block text-xs'>{scenario.behavior}</span>
              </span>
              <Badge variant={scenario.covered ? 'default' : 'secondary'}>
                {scenario.covered ? 'covered' : scenario.required ? 'required' : 'optional'}
              </Badge>
            </div>
          </div>
        ))}
        {summary.scenarios.length === 0 ? (
          <p className='text-muted-foreground py-5 text-sm'>No coverage scenarios mapped yet.</p>
        ) : null}
      </div>

      {scenarios.map((scenario) => (
        <div key={scenario.scenarioId} className='space-y-3'>
          <div>
            <span className='block truncate text-sm font-medium'>{scenario.title}</span>
            <span className='text-muted-foreground block truncate text-xs'>
              {scenario.latestSession
                ? `${scenario.latestSession.request} - ${scenario.latestSession.status}`
                : 'No verified session evidence yet'}
            </span>
          </div>
          <div className='divide-y border-y'>
            {scenario.evidence.map((artifact) => (
              <ArtifactRow
                key={artifact.artifactId}
                artifact={artifact}
                onPreviewArtifact={onPreviewArtifact}
                onRevealArtifact={onRevealArtifact}
              />
            ))}
            {scenario.evidence.length === 0 ? (
              <p className='text-muted-foreground py-5 text-sm'>
                Expected: {scenario.expectedEvidence.map((item) => item.label).join(', ')}
              </p>
            ) : null}
          </div>
        </div>
      ))}
    </section>
  );
}

function ArtifactRow({
  artifact,
  onPreviewArtifact,
  onRevealArtifact,
}: {
  artifact: TargetFlowCoverageEvidence;
  onPreviewArtifact: (artifact: TargetFlowCoverageEvidence) => void;
  onRevealArtifact: (artifact: TargetFlowCoverageEvidence) => void;
}) {
  const Icon = artifactIcon(artifact.kind);
  return (
    <div className='flex items-center justify-between gap-3 py-3'>
      <span className='flex min-w-0 items-center gap-2'>
        <Icon className='text-muted-foreground size-4 shrink-0' />
        <span className='min-w-0'>
          <span className='block truncate text-sm'>{artifact.label}</span>
          <span className='text-muted-foreground block truncate text-xs'>
            {artifactKindLabel(artifact.kind)}
          </span>
        </span>
      </span>
      <span className='flex shrink-0 gap-2'>
        {artifact.kind !== 'playwrightTrace' ? (
          <Button size='sm' variant='outline' onClick={() => onPreviewArtifact(artifact)}>
            Preview
          </Button>
        ) : null}
        <Button size='sm' variant='ghost' onClick={() => onRevealArtifact(artifact)}>
          <FolderOpen data-icon='inline-start' />
          Reveal
        </Button>
      </span>
    </div>
  );
}

function EvidenceStrip({ evidence }: { evidence: TargetFlowCoverageEvidence[] }) {
  if (!evidence.length) {
    return <p className='text-muted-foreground text-xs'>No test artifacts</p>;
  }

  return (
    <div className='flex flex-wrap gap-1'>
      {evidence.slice(0, 3).map((artifact) => {
        const Icon = artifactIcon(artifact.kind);
        return (
          <span
            key={artifact.artifactId}
            className='border-border inline-flex max-w-full items-center gap-1 rounded-md border px-1.5 py-0.5 text-xs'
          >
            <Icon className='size-3 shrink-0' />
            <span className='truncate'>{artifactKindLabel(artifact.kind)}</span>
          </span>
        );
      })}
      {evidence.length > 3 ? (
        <span className='text-muted-foreground px-1.5 py-0.5 text-xs'>+{evidence.length - 3}</span>
      ) : null}
    </div>
  );
}

function CoverageBadge({ status }: { status: TargetFlowCoverageSummary['status'] }) {
  if (status === 'covered') return <Badge>Covered</Badge>;
  if (status === 'partial') return <Badge variant='secondary'>Partial</Badge>;
  return <Badge variant='outline'>Missing</Badge>;
}

function CoverageKindBadge({ coverage }: { coverage: FlowCoverageKindSummary }) {
  const variant =
    coverage.status === 'covered'
      ? 'default'
      : coverage.status === 'partial'
        ? 'secondary'
        : 'outline';
  return <Badge variant={variant}>{coverageLabel(coverage.status)}</Badge>;
}

function coverageLabel(status: FlowCoverageKindStatus) {
  if (status === 'covered') return 'Covered';
  if (status === 'partial') return 'Partial';
  if (status === 'unmapped') return 'Unmapped';
  return 'Missing';
}

function artifactIcon(kind: TargetFlowCoverageEvidence['kind']) {
  if (kind === 'screenshot') return Image;
  if (kind === 'playwrightTrace') return Video;
  return FileText;
}

function artifactKindLabel(kind: TargetFlowCoverageEvidence['kind']) {
  if (kind === 'screenshot') return 'Image';
  if (kind === 'playwrightTrace') return 'Recording';
  return 'Assertions';
}
