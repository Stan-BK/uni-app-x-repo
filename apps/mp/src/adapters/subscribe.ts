function configuredTmplIds(): string[] {
  const ids = [
    import.meta.env.VITE_WEIXIN_SUBSCRIBE_TMPL_REGISTRATION_CONFIRMED,
    import.meta.env.VITE_WEIXIN_SUBSCRIBE_TMPL_ACTIVITY_STARTING,
  ];
  return ids
    .map((id) => (typeof id === "string" ? id.trim() : ""))
    .filter((id) => id.length > 0);
}

export async function requestRegistrationSubscribe(): Promise<void> {
  const tmplIds = configuredTmplIds();
  if (tmplIds.length === 0) {
    return;
  }
  // #ifdef MP-WEIXIN
  await new Promise<void>((resolve) => {
    uni.requestSubscribeMessage({
      tmplIds,
      complete: () => resolve(),
    });
  });
  // #endif
}
