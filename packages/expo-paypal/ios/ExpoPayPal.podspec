require 'json'

package = JSON.parse(File.read(File.join(__dir__, '..', 'package.json')))

Pod::Spec.new do |s|
  s.name           = 'ExpoPayPal'
  s.version        = package['version']
  s.summary        = package['description']
  s.description    = package['description']
  s.author         = package['author']
  s.homepage       = package['homepage']
  s.license        = package['license']
  # The PayPal SDK 3 needs iOS 16.
  s.platforms      = { :ios => '16.0' }
  s.swift_version  = '5.9'
  s.source         = { :git => 'https://github.com/hzblj/expo-paypal.git', :tag => "@hzblj/expo-paypal@#{s.version}" }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'
  s.dependency 'PayPal/PayPalPayments', '~> 3.1'
  s.dependency 'PayPal/CardPayments', '~> 3.1'
  s.dependency 'PayPal/PaymentButtons', '~> 3.1'
  s.dependency 'PayPal/FraudProtection', '~> 3.1'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }

  # `Tests` is a SwiftPM package over `Core`, run on the Mac; the pod never compiles it.
  s.source_files = '*.swift', 'Core/**/*.swift'
end
