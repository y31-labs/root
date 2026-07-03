import { BaseEdge, EdgeLabelRenderer, getBezierPath, type EdgeProps } from '@xyflow/react';

const WorkflowEdge = ({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  markerEnd,
  style,
  animated,
  label,
}: EdgeProps & { animated?: boolean }) => {
  const [path, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        markerEnd={markerEnd}
        style={{
          stroke: 'var(--border)',
          strokeWidth: 1.5,
          strokeDasharray: animated ? '6 6' : style?.strokeDasharray,
          animation: animated ? 'dashdraw 0.8s linear infinite' : undefined,
          ...style,
        }}
      />
      {label ? (
        <EdgeLabelRenderer>
          <span
            className='bg-background text-muted-foreground pointer-events-none absolute rounded-md border px-1.5 py-0.5 text-[10px]'
            style={{
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
            }}
          >
            {label}
          </span>
        </EdgeLabelRenderer>
      ) : null}
    </>
  );
};

const Animated = (props: EdgeProps) => <WorkflowEdge {...props} animated />;

const Temporary = (props: EdgeProps) => (
  <WorkflowEdge {...props} style={{ strokeDasharray: '4 6', opacity: 0.7, ...props.style }} />
);

export const Edge = {
  Animated,
  Temporary,
};
