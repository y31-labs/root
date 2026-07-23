import { useCallback, useEffect, useState } from 'react';

import type { Model, ModelSettings } from '#/lib/types';

const findDefaultModel = (models: Model[]) =>
  models.find(({ isDefault }) => isDefault) ?? models[0];

const settingsForModel = (model: Model, currentSettings?: ModelSettings): ModelSettings => {
  const currentReason = currentSettings?.reason;
  const reason =
    currentReason !== undefined && model.reason.options.includes(currentReason)
      ? currentReason
      : model.reason.default;
  const currentSpeed = currentSettings?.speed;
  const speed =
    currentSpeed !== undefined && model.speed.options.includes(currentSpeed)
      ? currentSpeed
      : model.speed.default;

  return { model: model.model, reason, speed };
};

export interface ModelSettingsState {
  catalogError?: string;
  loading: boolean;
  models: Model[];
  selectedModel?: Model;
  settings?: ModelSettings;
  selectReason: (reason: string) => void;
  selectModel: (model: string) => void;
  selectSpeed: (speed: string) => void;
}

export const useModelSettings = (loadModels: () => Promise<Model[]>): ModelSettingsState => {
  const [models, setModels] = useState<Model[]>([]);
  const [settings, setSettings] = useState<ModelSettings>();
  const [catalogError, setCatalogError] = useState<string>();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setModels([]);
    setSettings(undefined);
    setCatalogError(undefined);
    setLoading(true);

    void loadModels()
      .then((nextModels) => {
        if (!active) return;
        setModels(nextModels);
        setSettings((currentSettings) => {
          const selectedModel =
            nextModels.find((model) => model.model === currentSettings?.model) ??
            findDefaultModel(nextModels);
          return selectedModel ? settingsForModel(selectedModel, currentSettings) : undefined;
        });
        setCatalogError(undefined);
      })
      .catch((error: unknown) => {
        if (!active) return;
        setModels([]);
        setSettings(undefined);
        setCatalogError(error instanceof Error ? error.message : String(error));
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [loadModels]);

  const selectModel = useCallback(
    (model: string) => {
      const selectedModel = models.find((option) => option.model === model);
      if (selectedModel) setSettings(settingsForModel(selectedModel));
    },
    [models],
  );

  const selectReason = useCallback(
    (reason: string) => {
      setSettings((currentSettings) => {
        const selectedModel = models.find((model) => model.model === currentSettings?.model);
        if (!currentSettings || !selectedModel?.reason.options.includes(reason)) {
          return currentSettings;
        }
        return { ...currentSettings, reason };
      });
    },
    [models],
  );

  const selectSpeed = useCallback(
    (speed: string) => {
      setSettings((currentSettings) => {
        const selectedModel = models.find((model) => model.model === currentSettings?.model);
        if (!currentSettings || !selectedModel?.speed.options.includes(speed)) {
          return currentSettings;
        }
        return { ...currentSettings, speed };
      });
    },
    [models],
  );

  return {
    catalogError,
    loading,
    models,
    selectedModel: models.find((model) => model.model === settings?.model),
    settings,
    selectReason,
    selectModel,
    selectSpeed,
  };
};
