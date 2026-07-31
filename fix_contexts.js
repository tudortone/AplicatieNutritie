const fs = require('fs');

// AuthContext
let authContent = fs.readFileSync('frontend-nutritie/context/AuthContext.tsx', 'utf8');
authContent = authContent.replace(
  /const value = React\.useMemo\(\(\) => \(\{\r?\n\s*session,\r?\n\s*user,\r?\n\s*loadingAuth\r?\n\s*\}\), \[session, user, loadingAuth\]\);\r?\n\r?\n\s*return \(\r?\n\s*<AuthContext\.Provider value=\{value\}>\r?\n\s*\{children\}\r?\n\s*<\/AuthContext\.Provider>\r?\n\s*\);/g,
  `const value = React.useMemo(() => ({
    session,
    user,
    loadingAuth
  }), [session, user, loadingAuth]);

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );`
);
fs.writeFileSync('frontend-nutritie/context/AuthContext.tsx', authContent);

// GamificareContext
let gamiContent = fs.readFileSync('frontend-nutritie/context/GamificareContext.tsx', 'utf8');
gamiContent = gamiContent.replace(
  /const value = React\.useMemo\(\(\) => \(\{\r?\n\s*\.\.\.stare,\r?\n\s*setQuesturiAzi,\r?\n\s*adaugaProgres,\r?\n\s*revendicaRecompensaZilnica,\r?\n\s*refreshGamificare,\r?\n\s*toateQuesturileCompletate,\r?\n\s*detaliiNivel,\r?\n\s*\}\), \[\r?\n\s*stare,\r?\n\s*setQuesturiAzi,\r?\n\s*adaugaProgres,\r?\n\s*revendicaRecompensaZilnica,\r?\n\s*refreshGamificare,\r?\n\s*toateQuesturileCompletate,\r?\n\s*detaliiNivel\r?\n\s*\]\);\r?\n\r?\n\s*return \(\r?\n\s*<GamificareContext\.Provider value=\{value\}>\r?\n\s*\{children\}\r?\n\s*<\/GamificareContext\.Provider>\r?\n\s*\);/g,
  `const value = React.useMemo(() => ({
    ...stare,
    setQuesturiAzi,
    adaugaProgres,
    revendicaRecompensaZilnica,
    refreshGamificare,
    toateQuesturileCompletate,
    detaliiNivel,
  }), [
    stare,
    setQuesturiAzi,
    adaugaProgres,
    revendicaRecompensaZilnica,
    refreshGamificare,
    toateQuesturileCompletate,
    detaliiNivel
  ]);

  return (
    <GamificareContext.Provider value={value}>
      {children}
    </GamificareContext.Provider>
  );`
);
fs.writeFileSync('frontend-nutritie/context/GamificareContext.tsx', gamiContent);
