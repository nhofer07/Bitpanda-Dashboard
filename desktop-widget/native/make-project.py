from pathlib import Path
root=Path(__file__).resolve().parent
proj=root/'BitpandaWidget.xcodeproj';proj.mkdir(exist_ok=True)
ids={}
def I(name):
 if name not in ids:ids[name]=f'{len(ids)+1:024X}'
 return ids[name]
objects=[]
def obj(name,body):objects.append(f'{I(name)} = {{ {body} }};')
for name,path,typ in [('shared','Shared.swift','sourcecode.swift'),('appsrc','App.swift','sourcecode.swift'),('widgetsrc','Widget.swift','sourcecode.swift'),('ent','Entitlements.plist','text.plist.xml')]:
 obj(name,f'isa = PBXFileReference; lastKnownFileType = {typ}; path = {path}; sourceTree = "<group>";')
obj('appProd','isa = PBXFileReference; explicitFileType = wrapper.application; path = "Bitpanda Widget.app"; sourceTree = BUILT_PRODUCTS_DIR;')
obj('extProd','isa = PBXFileReference; explicitFileType = "wrapper.app-extension"; path = BitpandaWidget.appex; sourceTree = BUILT_PRODUCTS_DIR;')
for name,ref in [('appShared','shared'),('appBuild','appsrc'),('extShared','shared'),('extBuild','widgetsrc')]:obj(name,f'isa = PBXBuildFile; fileRef = {I(ref)};')
obj('embedBuild',f'isa = PBXBuildFile; fileRef = {I("extProd")}; settings = {{ ATTRIBUTES = (RemoveHeadersOnCopy,); }};')
obj('products',f'isa = PBXGroup; children = ({I("appProd")},{I("extProd")},); name = Products; sourceTree = "<group>";')
obj('group',f'isa = PBXGroup; children = ({I("shared")},{I("appsrc")},{I("widgetsrc")},{I("ent")},{I("products")},); sourceTree = "<group>";')
for name,files in [('appSources',['appShared','appBuild']),('extSources',['extShared','extBuild'])]:obj(name,f'isa = PBXSourcesBuildPhase; buildActionMask = 2147483647; files = ({",".join(I(x) for x in files)},); runOnlyForDeploymentPostprocessing = 0;')
obj('embed',f'isa = PBXCopyFilesBuildPhase; buildActionMask = 2147483647; dstPath = ""; dstSubfolderSpec = 13; files = ({I("embedBuild")},); name = "Embed App Extensions"; runOnlyForDeploymentPostprocessing = 0;')
obj('proxy',f'isa = PBXContainerItemProxy; containerPortal = {I("project")}; proxyType = 1; remoteGlobalIDString = {I("extTarget")}; remoteInfo = BitpandaWidget;')
obj('dep',f'isa = PBXTargetDependency; target = {I("extTarget")}; targetProxy = {I("proxy")};')
common='CODE_SIGN_STYLE = Automatic; DEVELOPMENT_TEAM = G2H7A7B9CD; CODE_SIGN_ENTITLEMENTS = Entitlements.plist; MACOSX_DEPLOYMENT_TARGET = 14.0; SDKROOT = macosx; SWIFT_VERSION = 5.0; ENABLE_APP_SANDBOX = YES; ENABLE_HARDENED_RUNTIME = YES; ENABLE_OUTGOING_NETWORK_CONNECTIONS = YES; GENERATE_INFOPLIST_FILE = NO; CURRENT_PROJECT_VERSION = 7; MARKETING_VERSION = 1.5; ENABLE_DEBUG_DYLIB = NO; '
for target,plist,bundle,product in [('app','App-Info.plist','com.bitpanda.local.widget','Bitpanda Widget'),('ext','Widget-Info.plist','com.bitpanda.local.widget.extension','BitpandaWidget')]:
 for mode in ['Debug','Release']:
  obj(target+mode,f'isa = XCBuildConfiguration; buildSettings = {{ {common} INFOPLIST_FILE = "{plist}"; PRODUCT_BUNDLE_IDENTIFIER = {bundle}; PRODUCT_NAME = "{product}"; SWIFT_OPTIMIZATION_LEVEL = "-Onone"; '+('APPLICATION_EXTENSION_API_ONLY = YES; SKIP_INSTALL = YES; ' if target=='ext' else '')+f'}}; name = {mode};')
 obj(target+'Cfg',f'isa = XCConfigurationList; buildConfigurations = ({I(target+"Debug")},{I(target+"Release")},); defaultConfigurationIsVisible = 0; defaultConfigurationName = Debug;')
obj('appTarget',f'isa = PBXNativeTarget; buildConfigurationList = {I("appCfg")}; buildPhases = ({I("appSources")},{I("embed")},); buildRules = (); dependencies = ({I("dep")},); name = "Bitpanda Widget"; productName = "Bitpanda Widget"; productReference = {I("appProd")}; productType = "com.apple.product-type.application";')
obj('extTarget',f'isa = PBXNativeTarget; buildConfigurationList = {I("extCfg")}; buildPhases = ({I("extSources")},); buildRules = (); dependencies = (); name = BitpandaWidget; productName = BitpandaWidget; productReference = {I("extProd")}; productType = "com.apple.product-type.app-extension";')
for mode in ['Debug','Release']:obj('prj'+mode,f'isa = XCBuildConfiguration; buildSettings = {{}}; name = {mode};')
obj('prjCfg',f'isa = XCConfigurationList; buildConfigurations = ({I("prjDebug")},{I("prjRelease")},); defaultConfigurationIsVisible = 0; defaultConfigurationName = Debug;')
obj('project',f'isa = PBXProject; attributes = {{ LastUpgradeCheck = 2700; TargetAttributes = {{ {I("appTarget")} = {{ DevelopmentTeam = G2H7A7B9CD; ProvisioningStyle = Automatic; }}; {I("extTarget")} = {{ DevelopmentTeam = G2H7A7B9CD; ProvisioningStyle = Automatic; }}; }}; }}; buildConfigurationList = {I("prjCfg")}; compatibilityVersion = "Xcode 14.0"; developmentRegion = de; hasScannedForEncodings = 0; knownRegions = (de,en,Base,); mainGroup = {I("group")}; productRefGroup = {I("products")}; projectDirPath = ""; projectRoot = ""; targets = ({I("appTarget")},{I("extTarget")},);')
(proj/'project.pbxproj').write_text('// !$*UTF8*$!\n{ archiveVersion = 1; classes = {}; objectVersion = 56; objects = {\n'+'\n'.join(objects)+f'\n}}; rootObject = {I("project")}; }}\n')
import plistlib
for name,src in [('App-Info.plist',str(root/'App-Info.plist')),('Widget-Info.plist',str(root/'Widget-Info.plist'))]:
 d=plistlib.loads(Path(src).read_bytes());d['CFBundleExecutable']='$(EXECUTABLE_NAME)';d['CFBundleIdentifier']='$(PRODUCT_BUNDLE_IDENTIFIER)';d['CFBundleVersion']='$(CURRENT_PROJECT_VERSION)';d['CFBundleShortVersionString']='$(MARKETING_VERSION)'
 for k in list(d):
  if k.startswith('DT'):del d[k]
 with (root/name).open('wb') as f:plistlib.dump(d,f)
print(proj)
