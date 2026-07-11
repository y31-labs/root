export const fetchPluginJson = async (url: URL, service: string): Promise<unknown> => {
  const response = await fetch(url, {
    headers: {
      Accept: 'application/json',
      'User-Agent': 'y31-interface-lab',
    },
  });

  if (!response.ok) {
    throw new Error(`${service} returned ${response.status}.`);
  }

  return response.json() as Promise<unknown>;
};
