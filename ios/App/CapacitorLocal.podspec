Pod::Spec.new do |s|
  s.name = "CapacitorLocal"
  s.version = "8.3.0"
  s.summary = "Capacitor - Local override without module maps"
  s.homepage = "https://capacitorjs.com/"
  s.license = "MIT"
  s.authors = "Ionic"
  s.platform = :ios, "15.0"
  s.source = { :path => "../../node_modules/@capacitor/ios" }
  s.source_files = "Capacitor/Capacitor/**/*.{swift,h,m}"
  s.resources = ["Capacitor/Capacitor/assets/native-bridge.js"]
  s.resource_bundles = { 'Capacitor' => ["Capacitor/Capacitor/PrivacyInfo.xcprivacy"] }
  s.dependency "CapacitorCordova"
  s.swift_version = "5.1"
  # Explicitly NOT setting module map
  # s.module_map = ...
end
