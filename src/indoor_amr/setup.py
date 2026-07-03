from setuptools import find_packages, setup

package_name = 'indoor_amr'

setup(
    name=package_name,
    version='0.0.0',
    packages=find_packages(exclude=['test']),
    data_files=[
    ('share/ament_index/resource_index/packages',
     ['resource/indoor_amr']),
    ('share/indoor_amr', ['package.xml']),
    ('share/indoor_amr/launch',
     ['launch/indoor_amr_launch.py']),
],
    install_requires=['setuptools'],
    zip_safe=True,
    maintainer='ubuntu',
    maintainer_email='ubuntu@todo.todo',
    description='TODO: Package description',
    license='TODO: License declaration',
    extras_require={
        'test': [
            'pytest',
        ],
    },
    entry_points={
        'console_scripts': [
        ],
    },
)
