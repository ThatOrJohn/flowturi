export const jsonConnector = async (url) => {
  const response = await fetch(url);
  const data = await response.json();
  if (!Array.isArray(data)) {
    throw new Error("Data must be an array of snapshots");
  }
  data.forEach((snapshot, i) => {
    if (!snapshot.timestamp || !snapshot.nodes || !snapshot.links) {
      throw new Error(`Snapshot ${i} is missing timestamp, nodes, or links`);
    }
  });
  return data;
};
