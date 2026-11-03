import NetInfo from "@react-native-community/netinfo";

export async function hasInternet(): Promise<boolean> {
  const state = await NetInfo.fetch();
  // Unknown reachability is not proof of being offline; let the API report failure.
  return state.isConnected !== false && state.isInternetReachable !== false;
}
