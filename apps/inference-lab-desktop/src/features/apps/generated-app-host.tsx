import { GeneratedAppIntegrations } from '#/features/apps/generated-app-integrations';
import { useGeneratedAppBridge } from '#/features/apps/use-generated-app-bridge';
import type { GeneratedAppRecord, LocalApi } from '#/lib/local-api';

export function GeneratedAppHost({ api, app }: { api: LocalApi; app: GeneratedAppRecord }) {
  const { frame, height, onFrameLoad, runtimeError } = useGeneratedAppBridge(api, app);

  return (
    <div className='min-h-full'>
      <GeneratedAppIntegrations api={api} app={app} />
      {runtimeError ? (
        <p className='border-b px-6 py-3 text-sm text-danger md:px-10' role='alert'>
          {runtimeError}
        </p>
      ) : null}
      <iframe
        ref={frame}
        sandbox='allow-scripts'
        src='/generated-app-frame.html'
        title={app.title}
        className='block w-full border-0 bg-background'
        style={{ height }}
        onLoad={onFrameLoad}
      />
    </div>
  );
}
