export function createCloudFormationTemplate(manifest) {
  if (!manifest.production) throw new Error('AWS hosting requires a production renderer build with HTTPS parent origins.')
  const edgeRejectHeaders = {
    'content-security-policy': { value: "default-src 'none'; sandbox allow-scripts; frame-ancestors 'none'; base-uri 'none'; form-action 'none'" },
    'content-type': { value: 'text/plain; charset=utf-8' },
    'cache-control': { value: 'no-store' },
    'referrer-policy': { value: 'no-referrer' },
    'x-content-type-options': { value: 'nosniff' },
    'permissions-policy': { value: manifest.headers['Permissions-Policy'] },
  }
  const functionCode = `function handler(event) {
  var request = event.request;
  var allowed = ${JSON.stringify(Object.keys(manifest.files))};
  if ((request.method !== 'GET' && request.method !== 'HEAD') || Object.keys(request.querystring).length || allowed.indexOf(request.uri) < 0) {
    return { statusCode: 403, statusDescription: 'Forbidden', headers: ${JSON.stringify(edgeRejectHeaders)} };
  }
  if (request.uri === '/') request.uri = '/index.html';
  return request;
}`
  const noForwarding = {
    CookiesConfig: { CookieBehavior: 'none' },
    HeadersConfig: { HeaderBehavior: 'none' },
    QueryStringsConfig: { QueryStringBehavior: 'none' },
    EnableAcceptEncodingGzip: true,
    EnableAcceptEncodingBrotli: true,
  }
  const responsePolicy = (cacheControl) => ({
    Type: 'AWS::CloudFront::ResponseHeadersPolicy',
    Properties: {
      ResponseHeadersPolicyConfig: {
        Name: { 'Fn::Sub': `${'${AWS::StackName}'}-${cacheControl === 'no-store' ? 'document' : 'assets'}` },
        SecurityHeadersConfig: {
          ContentSecurityPolicy: { ContentSecurityPolicy: manifest.headers['Content-Security-Policy'], Override: true },
          ContentTypeOptions: { Override: true },
          ReferrerPolicy: { ReferrerPolicy: 'no-referrer', Override: true },
          StrictTransportSecurity: { AccessControlMaxAgeSec: 31536000, IncludeSubdomains: false, Preload: false, Override: true },
        },
        CustomHeadersConfig: { Items: [
          { Header: 'Permissions-Policy', Value: manifest.headers['Permissions-Policy'], Override: true },
          { Header: 'Cache-Control', Value: cacheControl, Override: true },
        ] },
        CorsConfig: {
          AccessControlAllowOrigins: { Items: ['*'] },
          AccessControlAllowMethods: { Items: ['GET', 'HEAD'] },
          AccessControlAllowHeaders: { Items: ['*'] },
          AccessControlAllowCredentials: false,
          OriginOverride: true,
        },
        RemoveHeadersConfig: { Items: [{ Header: 'Set-Cookie' }, { Header: 'X-Powered-By' }] },
      },
    },
  })
  const behavior = (cachePolicy, headersPolicy) => ({
    TargetOriginId: 'RendererBucket',
    ViewerProtocolPolicy: 'https-only',
    AllowedMethods: ['GET', 'HEAD'],
    CachedMethods: ['GET', 'HEAD'],
    Compress: true,
    CachePolicyId: { Ref: cachePolicy },
    ResponseHeadersPolicyId: { Ref: headersPolicy },
    FunctionAssociations: [{ EventType: 'viewer-request', FunctionARN: { 'Fn::GetAtt': ['AllowlistedFiles', 'FunctionMetadata.FunctionARN'] } }],
  })
  return {
    AWSTemplateFormatVersion: '2010-09-09',
    Description: 'MAGE renderer only. Private S3, exact immutable assets, opaque response sandbox and no application API.',
    Parameters: {
      RendererDomainName: { Type: 'String', Description: 'Dedicated renderer hostname on a different registrable domain than MAGE. Never an app subdomain.', AllowedPattern: '[a-z0-9][a-z0-9.-]*\\.[a-z]{2,}' },
      CertificateArn: { Type: 'String', Description: 'Validated ACM certificate in us-east-1 for RendererDomainName.', AllowedPattern: 'arn:aws:acm:us-east-1:[0-9]{12}:certificate/[A-Za-z0-9-]+' },
    },
    Resources: {
      RendererBucket: {
        Type: 'AWS::S3::Bucket', DeletionPolicy: 'Retain', UpdateReplacePolicy: 'Retain',
        Properties: {
          PublicAccessBlockConfiguration: { BlockPublicAcls: true, IgnorePublicAcls: true, BlockPublicPolicy: true, RestrictPublicBuckets: true },
          OwnershipControls: { Rules: [{ ObjectOwnership: 'BucketOwnerEnforced' }] },
          BucketEncryption: { ServerSideEncryptionConfiguration: [{ ServerSideEncryptionByDefault: { SSEAlgorithm: 'AES256' } }] },
          VersioningConfiguration: { Status: 'Enabled' },
        },
      },
      OriginAccessControl: { Type: 'AWS::CloudFront::OriginAccessControl', Properties: { OriginAccessControlConfig: { Name: { 'Fn::Sub': '${AWS::StackName}-origin' }, OriginAccessControlOriginType: 's3', SigningBehavior: 'always', SigningProtocol: 'sigv4' } } },
      AllowlistedFiles: { Type: 'AWS::CloudFront::Function', Properties: { Name: { 'Fn::Sub': '${AWS::StackName}-files' }, AutoPublish: true, FunctionConfig: { Comment: 'Only the renderer document and its exact immutable bundle; no query forwarding.', Runtime: 'cloudfront-js-2.0' }, FunctionCode: functionCode } },
      DocumentCache: { Type: 'AWS::CloudFront::CachePolicy', Properties: { CachePolicyConfig: { Name: { 'Fn::Sub': '${AWS::StackName}-document' }, DefaultTTL: 0, MaxTTL: 0, MinTTL: 0, ParametersInCacheKeyAndForwardedToOrigin: { ...noForwarding, EnableAcceptEncodingGzip: false, EnableAcceptEncodingBrotli: false } } } },
      AssetCache: { Type: 'AWS::CloudFront::CachePolicy', Properties: { CachePolicyConfig: { Name: { 'Fn::Sub': '${AWS::StackName}-assets' }, DefaultTTL: 31536000, MaxTTL: 31536000, MinTTL: 31536000, ParametersInCacheKeyAndForwardedToOrigin: noForwarding } } },
      DocumentHeaders: responsePolicy('no-store'),
      AssetHeaders: responsePolicy('public, max-age=31536000, immutable'),
      Distribution: {
        Type: 'AWS::CloudFront::Distribution', Properties: { DistributionConfig: {
          Enabled: true,
          Comment: 'MAGE isolated custom renderer; keep main-app custom playback gate disabled until PP-I03.',
          Aliases: [{ Ref: 'RendererDomainName' }],
          HttpVersion: 'http2and3',
          IPV6Enabled: true,
          ViewerCertificate: { AcmCertificateArn: { Ref: 'CertificateArn' }, SslSupportMethod: 'sni-only', MinimumProtocolVersion: 'TLSv1.2_2021' },
          Origins: [{ Id: 'RendererBucket', DomainName: { 'Fn::GetAtt': ['RendererBucket', 'RegionalDomainName'] }, S3OriginConfig: { OriginAccessIdentity: '' }, OriginAccessControlId: { Ref: 'OriginAccessControl' } }],
          DefaultCacheBehavior: behavior('DocumentCache', 'DocumentHeaders'),
          CacheBehaviors: [{ PathPattern: manifest.bundlePath, ...behavior('AssetCache', 'AssetHeaders') }],
          // No custom error -> index mapping, no API origin, and no forwarded user state.
          CustomErrorResponses: [{ ErrorCode: 403, ErrorCachingMinTTL: 0 }, { ErrorCode: 404, ErrorCachingMinTTL: 0 }],
        } },
      },
      RendererBucketPolicy: { Type: 'AWS::S3::BucketPolicy', Properties: { Bucket: { Ref: 'RendererBucket' }, PolicyDocument: { Version: '2012-10-17', Statement: [
        { Sid: 'CloudFrontReadOnly', Effect: 'Allow', Principal: { Service: 'cloudfront.amazonaws.com' }, Action: 's3:GetObject', Resource: { 'Fn::Sub': '${RendererBucket.Arn}/*' }, Condition: { StringEquals: { 'AWS:SourceArn': { 'Fn::Sub': 'arn:aws:cloudfront::${AWS::AccountId}:distribution/${Distribution}' } } } },
        { Sid: 'RequireTLS', Effect: 'Deny', Principal: '*', Action: 's3:*', Resource: [{ 'Fn::GetAtt': ['RendererBucket', 'Arn'] }, { 'Fn::Sub': '${RendererBucket.Arn}/*' }], Condition: { Bool: { 'aws:SecureTransport': 'false' } } },
      ] } } },
    },
    Outputs: {
      BucketName: { Value: { Ref: 'RendererBucket' } },
      DistributionId: { Value: { Ref: 'Distribution' } },
      DistributionDomainName: { Value: { 'Fn::GetAtt': ['Distribution', 'DomainName'] } },
      RendererOrigin: { Value: { 'Fn::Sub': 'https://${RendererDomainName}' } },
    },
  }
}
