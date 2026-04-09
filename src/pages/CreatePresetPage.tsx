import { useId, useState } from 'react'
import type { FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { AuthPage, AuthPageHeader } from '../components/AuthPage'
import { parseApiError } from '../lib/authForm'
import { useAuth } from '../auth/AuthContext'

type CreatePresetFormValues = {
  name: string
  sceneData: string
}

type CreatePresetFormErrors = Partial<Record<keyof CreatePresetFormValues | 'form', string>>

const initialValues: CreatePresetFormValues = {
  name: '',
  sceneData: '',
}

function validateForm(values: CreatePresetFormValues): CreatePresetFormErrors {
  const errors: CreatePresetFormErrors = {}

  if (!values.name.trim()) {
    errors.name = 'Preset name is required.'
  } else if (values.name.trim().length < 2) {
    errors.name = 'Preset name must be at least 2 characters.'
  }

  if (!values.sceneData.trim()) {
    errors.sceneData = 'Scene data is required.'
  } else {
    try {
      JSON.parse(values.sceneData.trim())
    } catch {
      errors.sceneData = 'Scene data must be valid JSON.'
    }
  }

  return errors
}

export function CreatePresetPage() {
  const { authenticatedFetch } = useAuth()
  const navigate = useNavigate()
  const [values, setValues] = useState(initialValues)
  const [errors, setErrors] = useState<CreatePresetFormErrors>({})
  const [isSubmitting, setIsSubmitting] = useState(false)

  const formErrorId = useId()
  const titleId = 'create-preset-title'

  function handleChange(field: keyof CreatePresetFormValues, nextValue: string) {
    setValues((currentValues) => ({ ...currentValues, [field]: nextValue }))
    setErrors((currentErrors) => {
      if (!currentErrors[field] && !currentErrors.form) return currentErrors
      return { ...currentErrors, [field]: undefined, form: undefined }
    })
  }

   async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const trimmedValues = {
      name: values.name.trim(),
      sceneData: values.sceneData.trim(),
    }

    const nextErrors = validateForm(trimmedValues)
    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors)
      return
    }

    setIsSubmitting(true)
    setErrors({})

    try {
      const response = await authenticatedFetch('/presets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: trimmedValues.name,
          sceneData: JSON.parse(trimmedValues.sceneData),
        }),
      })

      if (!response.ok) {
        const apiError = await parseApiError(response)
        const backendDetails = apiError?.details ?? {}
        setErrors({
          name: backendDetails.name,
          sceneData: backendDetails.sceneData,
          form: apiError?.message ?? 'Failed to create preset. Please try again.',
        })
        return
      }

      navigate('/my-presets')
    } catch {
      setErrors({
        form: 'Preset creation is unavailable right now. Please try again in a moment.',
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <AuthPage titleId={titleId}>
      <AuthPageHeader
        description="Fill in the details below to create a new preset."
        eyebrow="New Preset"
        title="Create Preset"
        titleId={titleId}
      />
    <form className="auth-form" noValidate onSubmit={handleSubmit}>
        <div className="field-group">
          <label htmlFor="name">Preset name</label>
          <input
            id="name"
            name="name"
            type="text"
            required
            minLength={2}
            value={values.name}
            onChange={(event) => handleChange('name', event.target.value)}
            aria-invalid={Boolean(errors.name)}
            aria-describedby={errors.name ? 'name-error' : undefined}
            placeholder="My Preset"
          />
          {errors.name ? (
            <p className="field-error" id="name-error" role="alert">{errors.name}</p>
          ) : null}
          </div>

           <div className="field-group">
          <label htmlFor="sceneData">Scene data (JSON)</label>
          <textarea
            id="sceneData"
            name="sceneData"
            required
            rows={6}
            value={values.sceneData}
            onChange={(event) => handleChange('sceneData', event.target.value)}
            aria-invalid={Boolean(errors.sceneData)}
            aria-describedby={errors.sceneData ? 'sceneData-error' : undefined}
            placeholder='{"key": "value"}'
          />
          {errors.sceneData ? (
            <p className="field-error" id="sceneData-error" role="alert">{errors.sceneData}</p>
          ) : null}
        </div>
        
        {errors.form ? (
          <div className="form-alert" id={formErrorId} role="alert">{errors.form}</div>
        ) : null}
        
        <button className="demo-link auth-submit" type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Creating preset...' : 'Create preset'}
        </button>
    </form>
    </AuthPage>
  )
}
