// 加色（Additive）柔边烟雾粒子 —— 供 VFX Graph 的自定义输出或手写粒子用
// ---------------------------------------------------------------
// 特点：
//   · Additive 叠加，半透明（不开深度写入，Blend One One）
//   · Soft Particle：用相机深度纹理做软过渡，避免粒子与几何硬边相交
//     （需要 URP 资产开启 Depth Texture / 或用 Depth Priming 代替）
//   · 双色：主色冰蓝 + 内层暖金（用噪声/UV 混合），加色叠加时自然发亮
//   · 边缘羽化：径向渐隐 + 噪声扰动，模拟烟团而非圆点
//
// 注意：VFX Graph 自带的 Output Particle / Lit 也能做加色与软粒子；
//      本着色器用于「需要更精细的烟雾外观」或「不想开 VFX 的降级路径」。

Shader "HexagramVFX/SmokeAdditive"
{
    Properties
    {
        _ColorPrimary ("主色（冰蓝）", Color) = (0.42, 0.72, 1.0, 1)
        _ColorAccent  ("内层暖金", Color) = (1.0, 0.72, 0.34, 1)
        _Intensity    ("亮度", Range(0,4)) = 1.0
        _SoftDistance ("软边距离", Range(0.01,2)) = 0.35
        _NoiseScale   ("噪声缩放", Float) = 3.0
        _NoiseAmount  ("噪声强度", Range(0,2)) = 0.8
        _RotationSpeed("自转速度", Float) = 0.35
    }

    SubShader
    {
        Tags
        {
            "RenderType" = "Transparent"
            "Queue" = "Transparent"
            "RenderPipeline" = "UniversalPipeline"
            "IgnoreProjector" = "True"
            "PreviewType" = "Plane"
        }
        LOD 100

        Pass
        {
            Name "AdditiveSoft"
            Tags { "LightMode"="UniversalForward" }
            Blend One One          // 加色
            ZWrite Off
            ZTest LEqual
            Cull Off

            HLSLPROGRAM
            #pragma vertex vert
            #pragma fragment frag
            #pragma multi_compile_fog
            #pragma multi_compile_local _ _SOFT_PARTICLES_ON

            #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Core.hlsl"
            #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/DeclareDepthTexture.hlsl"

            CBUFFER_START(UnityPerMaterial)
                float4 _ColorPrimary;
                float4 _ColorAccent;
                float  _Intensity;
                float  _SoftDistance;
                float  _NoiseScale;
                float  _NoiseAmount;
                float  _RotationSpeed;
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
                float4 screenPos  : TEXCOORD1;
                float  fogCoord   : TEXCOORD2;
                float  rot        : TEXCOORD3;
            };

            // 便宜的 2D 值噪声（哈希），够用且不占指令
            float hash21(float2 p)
            {
                p = frac(p * float2(123.34, 456.21));
                p += dot(p, p + 45.32);
                return frac(p.x * p.y);
            }
            float vnoise(float2 p)
            {
                float2 i = floor(p), f = frac(p);
                f = f * f * (3.0 - 2.0 * f);
                float a = hash21(i), b = hash21(i + float2(1, 0));
                float c = hash21(i + float2(0, 1)), d = hash21(i + float2(1, 1));
                return lerp(lerp(a, b, f.x), lerp(c, d, f.x), f.y);
            }

            Varyings vert(Attributes IN)
            {
                Varyings OUT;
                // 随时间自转（每颗粒子相位不同，用 instanceID 派生）
                float ang = _Time.y * _RotationSpeed + (UNITY_VERTEX_INPUT_INSTANCE_ID * 0.6180339887f % 6.2831853f);
                float s, c;
                sincos(ang, s, c);
                float2 uv = IN.uv - 0.5;
                uv = float2(uv.x * c - uv.y * s, uv.x * s + uv.y * c) + 0.5;

                VertexPositionInputs pos = GetVertexPositionInputs(IN.positionOS.xyz);
                OUT.positionCS = pos.positionCS;
                OUT.uv = uv;
                OUT.screenPos = ComputeScreenPos(pos.positionCS);
                OUT.fogCoord = ComputeFogFactor(pos.positionCS.z);
                OUT.rot = ang;
                return OUT;
            }

            half4 frag(Varyings IN) : SV_Target
            {
                // 径向羽化
                float2 p = IN.uv - 0.5;
                float r = length(p) * 2.0;
                float mask = saturate(1.0 - r);
                mask *= mask;

                // 噪声扰动边缘（湍流感）
                float n = vnoise(IN.uv * _NoiseScale + float2(IN.rot, -IN.rot) * 0.3);
                mask *= saturate(1.0 - _NoiseAmount * 0.5 + n * _NoiseAmount * 0.5);

                // 软粒子：与场景深度的差值
                #if defined(_SOFT_PARTICLES_ON)
                float sceneDepth = LinearEyeDepth(SampleSceneDepth(IN.screenPos.xy / IN.screenPos.w));
                float particleDepth = IN.screenPos.w;
                float fade = saturate((sceneDepth - particleDepth) / max(1e-4, _SoftDistance));
                mask *= fade;
                #endif

                // 双色：中心偏暖金，外围偏冰蓝
                float3 col = lerp(_ColorPrimary.rgb, _ColorAccent.rgb, saturate(1.0 - r * 1.6) * 0.7);
                col *= _Intensity * mask;

                col = MixFog(col, IN.fogCoord);
                return half4(col, mask);
            }
            ENDHLSL
        }
    }
    FallBack Off
}
