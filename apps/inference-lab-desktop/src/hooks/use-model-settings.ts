import { useCallback, useEffect, useState } from 'react';

import type { Model, ModelSettings, ModelSpeed } from '#/lib/types';

const findDefaultModel = (models: Model[]) =>
  models.find(({ isDefault }) => isDefault) ?? models[0];

const settingsForModel = (model: Model, currentSettings?: ModelSettings): ModelSettings => {
  const currentEffort = currentSettings?.effort;
  const effort =
    currentEffort !== undefined && model.effort.options.includes(currentEffort)
      ? currentEffort
      : model.effort.default;
  const currentSpeed = currentSettings?.speed;
  const speed =
    currentSpeed !== undefined && model.speed.options.includes(currentSpeed)
      ? currentSpeed
      : model.speed.default;

  return { model: model.model, effort, speed };
};

export interface ModelSettingsState {
  catalogError?: string;
  loading: boolean;
  models: Model[];
  selectedModel?: Model;
  settings?: ModelSettings;
  selectEffort: (effort: string) => void;
  selectModel: (model: string) => void;
  selectSpeed: (speed: ModelSpeed) => void;
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

  const selectEffort = useCallback(
    (effort: string) => {
      setSettings((currentSettings) => {
        const selectedModel = models.find((model) => model.model === currentSettings?.model);
        if (!currentSettings || !selectedModel?.effort.options.includes(effort)) {
          return currentSettings;
        }
        return { ...currentSettings, effort };
      });
    },
    [models],
  );

  const selectSpeed = useCallback(
    (speed: ModelSpeed) => {
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
    selectEffort,
    selectModel,
    selectSpeed,
  };
};
