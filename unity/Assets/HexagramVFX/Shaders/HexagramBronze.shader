// 古铜 PBR 金属 + 边缘暖金自发光（URP / 手写精简 PBR，移动端友好）
// ---------------------------------------------------------------
// 用法：新建材质，Shader 选本文件，指定 _BaseColor（古铜）、
//      _EmissiveColor（暖金）、_EmissiveStrength（自发光强度）。
// 边缘光：按 UV 到面边界的距离算（盒体每个面独立映射，故边界即轮廓），
//        故每根爻的四周都会有一圈微弱的暖金描边。
// 性能：一次主光 + 一个环境近似（无 IBL 采样），比 URP Lit 更省。

Shader "HexagramVFX/Bronze"
{
    Properties
    {
        _BaseColor      ("古铜基色", Color) = (0.36, 0.22, 0.10, 1)
        _Metallic       ("金属度", Range(0,1)) = 1.0
        _Roughness      ("粗糙度", Range(0.04,1)) = 0.34
        _EmissiveColor  ("边缘暖金", Color) = (1.0, 0.72, 0.34, 1)
        _EmissiveStrength ("自发光强度", Range(0,4)) = 1.1
        _EdgeWidth      ("边缘宽度", Range(0.001,0.2)) = 0.055
        _EnvIntensity   ("环境光强度", Range(0,2)) = 0.55
    }

    SubShader
    {
        Tags { "RenderType"="Opaque" "RenderPipeline"="UniversalPipeline" "Queue"="Geometry" }
        LOD 300

        Pass
        {
            Name "ForwardLit"
            Tags { "LightMode"="UniversalForward" }

            HLSLPROGRAM
            #pragma vertex vert
            #pragma fragment frag
            #pragma multi_compile _ _MAIN_LIGHT_SHADOWS _MAIN_LIGHT_SHADOWS_CASCADE
            #pragma multi_compile _ _ADDITIONAL_LIGHTS_VERTEX _ADDITIONAL_LIGHTS
            #pragma multi_compile_fog

            #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Core.hlsl"
            #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Lighting.hlsl"

            CBUFFER_START(UnityPerMaterial)
                float4 _BaseColor;
                float4 _EmissiveColor;
                float  _Metallic;
                float  _Roughness;
                float  _EmissiveStrength;
                float  _EdgeWidth;
                float  _EnvIntensity;
            CBUFFER_END

            struct Attributes
            {
                float4 positionOS : POSITION;
                float3 normalOS   : NORMAL;
                float2 uv         : TEXCOORD0;
            };

            struct Varyings
            {
                float4 positionCS : SV_POSITION;
                float3 normalWS   : TEXCOORD0;
                float2 uv         : TEXCOORD1;
                float3 positionWS : TEXCOORD2;
                float  fogCoord   : TEXCOORD3;
            };

            Varyings vert(Attributes IN)
            {
                Varyings OUT;
                VertexPositionInputs pos = GetVertexPositionInputs(IN.positionOS.xyz);
                OUT.positionCS = pos.positionCS;
                OUT.positionWS = pos.positionWS;
                OUT.normalWS = TransformObjectToWorldNormal(IN.normalOS);
                OUT.uv = IN.uv;
                OUT.fogCoord = ComputeFogFactor(pos.positionCS.z);
                return OUT;
            }

            // 简易 GGX
            float DistributionGGX(float NdotH, float a)
            {
                float a2 = a * a;
                float d = NdotH * NdotH * (a2 - 1.0) + 1.0;
                return a2 / max(1e-5, PI * d * d);
            }
            float GeometrySmith(float NdotV, float NdotL, float a)
            {
                float k = (a + 1.0) * (a + 1.0) / 8.0;
                float gv = NdotV / (NdotV * (1.0 - k) + k);
                float gl = NdotL / (NdotL * (1.0 - k) + k);
                return gv * gl;
            }
            float3 fresnel(float3 F0, float cosT) { return F0 + (1.0 - F0) * pow(1.0 - cosT, 5.0); }

            half4 frag(Varyings IN) : SV_Target
            {
                float3 N = normalize(IN.normalWS);
                float3 V = normalize(GetWorldSpaceViewDir(IN.positionWS));
                float NdotV = max(dot(N, V), 1e-4);

                // 环境近似：用主光方向与天顶色模拟（手机不采样 IBL）
                float3 ambTop = half3(0.16, 0.22, 0.30) * _EnvIntensity;
                float3 ambBot = half3(0.06, 0.05, 0.04) * _EnvIntensity;
                float3 irradiance = lerp(ambBot, ambTop, N.y * 0.5 + 0.5);

                Light mainLight = GetMainLight();
                float3 L = normalize(mainLight.direction);
                float NdotL = saturate(dot(N, L));
                float3 H = normalize(L + V);
                float NdotH = saturate(dot(N, H));

                float a = max(0.002, _Roughness * _Roughness);
                float3 F0 = lerp(0.04, _BaseColor.rgb, _Metallic);
                float3 F = fresnel(F0, max(dot(H, V), 0.0));

                float3 spec = F * DistributionGGX(NdotH, a) * GeometrySmith(NdotV, NdotL, a) / max(1e-4, 4.0 * NdotV * NdotL);
                float3 diff = _BaseColor.rgb * (1.0 - _Metallic) * irradiance;
                float3 direct = spec * mainLight.color * NdotL + diff * mainLight.color * NdotL;

                // 附加灯（筒灯）
                #if defined(_ADDITIONAL_LIGHTS)
                uint lightCount = GetAdditionalLightsCount();
                for (uint i = 0u; i < lightCount; i++)
                {
                    Light l = GetAdditionalLight(i, IN.positionWS);
                    float3 Ll = normalize(l.direction);
                    float ndl = saturate(dot(N, Ll));
                    float3 Hh = normalize(Ll + V);
                    float3 sp = F * DistributionGGX(saturate(dot(N, Hh)), a)
                              * GeometrySmith(NdotV, ndl, a) / max(1e-4, 4.0 * NdotV * ndl);
                    direct += sp * l.color * ndl;
                }
                #endif

                // 边缘暖金自发光：UV 到面边界的距离
                float2 d = min(IN.uv, 1.0 - IN.uv);
                float edge = 1.0 - saturate(min(d.x, d.y) / max(1e-4, _EdgeWidth));
                edge = edge * edge * (3.0 - 2.0 * edge);          // 平滑
                float3 emis = _EmissiveColor.rgb * _EmissiveStrength * edge;

                half3 color = direct + emis;
                color = MixFog(color, IN.fogCoord);
                return half4(color, 1.0);
            }
            ENDHLSL
        }

        // 深度/阴影用（URP 需要 DepthOnly 与 ShadowCaster 通道）
        Pass
        {
            Name "ShadowCaster"
            Tags { "LightMode"="ShadowCaster" }
            ZWrite On ZTest LEqual ColorMask 0
            HLSLPROGRAM
            #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Core.hlsl"
            #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Shadows.hlsl"
            float3 _LightDirection;
            float3 _LightPosition;
            struct Attributes { float4 positionOS : POSITION; float3 normalOS : NORMAL; };
            struct Varyings { float4 positionCS : SV_POSITION; };
            Varyings vert(Attributes IN)
            {
                Varyings OUT;
                float3 posWS = TransformObjectToWorld(IN.positionOS.xyz);
                float3 normalWS = TransformObjectToWorldNormal(IN.normalOS);
                #if _CASTING_PUNCTUAL_LIGHT_SHADOW
                    float3 lightDirWS = normalize(_LightPosition - posWS);
                #else
                    float3 lightDirWS = _LightDirection;
                #endif
                float4 positionCS = TransformWorldToHClip(ApplyShadowBias(posWS, normalWS, lightDirWS));
                #if UNITY_REVERSED_Z
                    positionCS.z = min(positionCS.z, UNITY_NEAR_CLIP_VALUE);
                #else
                    positionCS.z = max(positionCS.z, UNITY_NEAR_CLIP_VALUE);
                #endif
                OUT.positionCS = positionCS;
                return OUT;
            }
            half4 frag(Varyings IN) : SV_Target { return 0; }
            ENDHLSL
        }

        Pass
        {
            Name "DepthOnly"
            Tags { "LightMode"="DepthOnly" }
            ZWrite On ColorMask 0
            HLSLPROGRAM
            #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Core.hlsl"
            struct Attributes { float4 positionOS : POSITION; };
            struct Varyings { float4 positionCS : SV_POSITION; };
            Varyings vert(Attributes IN)
            {
                Varyings OUT;
                OUT.positionCS = TransformObjectToHClip(IN.positionOS.xyz);
                return OUT;
            }
            half4 frag(Varyings IN) : SV_Target { return 0; }
            ENDHLSL
        }
    }
    FallBack "Universal Render Pipeline/Lit"
}
