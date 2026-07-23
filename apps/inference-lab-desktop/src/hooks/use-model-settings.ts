import { useCallback, useEffect, useState } from 'react';

import type { Model, ModelSettings } from '#/lib/types';

const findDefaultModel = (models: Model[]) =>
  models.find(({ isDefault }) => isDefault) ?? models[0];

const settingsForModel = (model: Model, currentSettings?: ModelSettings): ModelSettings => {
  const currentEffort = currentSettings?.effort;
  const effort =
    currentEffort !== undefined &&
    model.supportedReasoningEfforts.some((option) => option.reasoningEffort === currentEffort)
      ? currentEffort
      : model.defaultReasoningEffort;
  const currentServiceTier = currentSettings?.serviceTier;
  const serviceTier =
    currentServiceTier === null ||
    (currentServiceTier !== undefined &&
      model.serviceTiers.some((tier) => tier.id === currentServiceTier))
      ? currentServiceTier
      : model.defaultServiceTier;

  return { model: model.model, effort, serviceTier };
};

export interface ModelSettingsState {
  catalogError?: string;
  loading: boolean;
  models: Model[];
  selectedModel?: Model;
  settings?: ModelSettings;
  selectEffort: (effort: string) => void;
  selectModel: (model: string) => void;
  selectServiceTier: (serviceTier: string | null) => void;
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
        if (
          !currentSettings ||
          !selectedModel?.supportedReasoningEfforts.some(
            (option) => option.reasoningEffort === effort,
          )
        ) {
          return currentSettings;
        }
        return { ...currentSettings, effort };
      });
    },
    [models],
  );

  const selectServiceTier = useCallback(
    (serviceTier: string | null) => {
      setSettings((currentSettings) => {
        const selectedModel = models.find((model) => model.model === currentSettings?.model);
        if (
          !currentSettings ||
          (serviceTier !== null &&
            !selectedModel?.serviceTiers.some((tier) => tier.id === serviceTier))
        ) {
          return currentSettings;
        }
        return { ...currentSettings, serviceTier };
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
    selectServiceTier,
  };
};
