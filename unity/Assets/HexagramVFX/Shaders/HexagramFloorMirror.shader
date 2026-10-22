// 镜面地面（平面反射 + 极简科技展厅的地面质感）
// ---------------------------------------------------------------
// 用法：新建材质，Shader 选本文件；把 HexagramFloorMirror 生成的
//      RenderTexture 赋给 _ReflectionTex（脚本会自动设）。
// 反射 UV：用屏幕空间坐标（反射图是按主相机视点渲染的，故与屏幕 UV 对齐）。
// 性能：一次纹理采样 + 一点数学，手机无压力；反射图可半分辨率。

Shader "HexagramVFX/FloorMirror"
{
    Properties
    {
        _BaseColor      ("地面基色", Color) = (0.035, 0.045, 0.06, 1)
        _ReflectStrength ("反射强度", Range(0,1)) = 0.75
        _ReflectBlur    ("反射模糊（按粗糙度）", Range(0,1)) = 0.35
        _GridColor      ("地面网格色", Color) = (0.35, 0.55, 0.72, 1)
        _GridScale      ("网格密度", Float) = 12
        _GridWidth      ("网格线宽", Range(0,0.2)) = 0.035
        _FadeDistance   ("反射淡出距离", Float) = 14
    }

    SubShader
    {
        Tags { "RenderType"="Opaque" "RenderPipeline"="UniversalPipeline" "Queue"="Geometry" }
        LOD 200

        Pass
        {
            Name "Forward"
            Tags { "LightMode"="UniversalForward" }
            ZWrite On

            HLSLPROGRAM
            #pragma vertex vert
            #pragma fragment frag
            #pragma multi_compile_fog

            #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Core.hlsl"

            TEXTURE2D(_ReflectionTex); SAMPLER(sampler_ReflectionTex);

            CBUFFER_START(UnityPerMaterial)
                float4 _BaseColor;
                float  _ReflectStrength;
                float  _ReflectBlur;
                float4 _GridColor;
                float  _GridScale;
                float  _GridWidth;
                float  _FadeDistance;
            CBUFFER_END

            struct Attributes
            {
                float4 positionOS : POSITION;
                float2 uv         : TEXCOORD0;
            };
            struct Varyings
            {
                float4 positionCS : SV_POSITION;
                float2 uv         : TEXCOORD0;
                float3 positionWS : TEXCOORD1;
                float  fogCoord   : TEXCOORD2;
            };

            Varyings vert(Attributes IN)
            {
                Varyings OUT;
                VertexPositionInputs pos = GetVertexPositionInputs(IN.positionOS.xyz);
                OUT.positionCS = pos.positionCS;
                OUT.uv = IN.uv;
                OUT.positionWS = pos.positionWS;
                OUT.fogCoord = ComputeFogFactor(pos.positionCS.z);
                return OUT;
            }

            half4 frag(Varyings IN) : SV_Target
            {
                // 反射图按主相机视点渲染，故用屏幕 UV 对齐
                float2 screenUV = IN.positionCS.xy / _ScreenParams.xy;
                // 粗糙度模拟模糊：往画面中心外偏移几个像素
                float2 blur = (screenUV - 0.5) * _ReflectBlur * 0.02;
                float3 refl = SAMPLE_TEXTURE2D(_ReflectionTex, sampler_ReflectionTex, screenUV + blur).rgb;

                // 网格：以世界坐标算，等距网格（极简展厅的地面分格）
                float2 g = frac(IN.positionWS.xz * _GridScale);
                float2 gw = fwidth(IN.positionWS.xz * _GridScale);
                float2 lineDist = min(g, 1.0 - g) / max(gw, 1e-4);
                float line = 1.0 - saturate(min(lineDist.x, lineDist.y) - (1.0 - _GridWidth) * 8.0);
                line = saturate(line);

                // 远处反射淡出（避免边缘拉花）
                float fade = saturate(1.0 - length(IN.positionWS.xz) / _FadeDistance);

                float3 col = _BaseColor.rgb;
                col += refl * _ReflectStrength * fade;
                col += _GridColor.rgb * line * 0.12 * fade;

                col = MixFog(col, IN.fogCoord);
                return half4(col, 1.0);
            }
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
